import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'
import type { TestProject } from 'vitest/node'

const execute = promisify(execFile)
const image = 'postgres:17@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

// Never accept DATABASE_URL or import application env/Prisma initialization here.
// Only a container created by this invocation can be migrated or removed.
export default async function setup(project: TestProject) {
  const container = `sightpace-test-${randomUUID()}`
  const password = randomBytes(24).toString('hex')
  const temporary = await mkdtemp(join(tmpdir(), 'sightpace-db-'))
  let stage = 'container startup'
  let created = false
  let client: Client | undefined

  async function cleanup() {
    await client?.end()
    client = undefined

    if (created) {
      await execute('docker', ['rm', '--force', '--volumes', container], { timeout: 30_000 })
      created = false
    }

    await rm(temporary, { recursive: true, force: true })
  }

  try {
    await execute(
      'docker',
      [
        'run',
        '--detach',
        '--name',
        container,
        '--label',
        'sightpace.fixture=true',
        '--publish',
        '127.0.0.1::5432',
        '--tmpfs',
        '/var/lib/postgresql/data',
        '--env',
        'POSTGRES_PASSWORD',
        '--env',
        'POSTGRES_USER=sightpace_test',
        '--env',
        'POSTGRES_DB=sightpace_test',
        image,
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 120_000 },
    )

    created = true

    const { stdout } = await execute('docker', ['port', container, '5432/tcp'])
    const port = /^127\.0\.0\.1:(\d+)\s*$/.exec(stdout)?.[1]

    if (!port) throw new Error('Expected a loopback-only fixture port')

    const databaseUrl = `postgresql://sightpace_test:${password}@127.0.0.1:${port}/sightpace_test`
    let ready = false

    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await execute('docker', [
          'exec',
          container,
          'pg_isready',
          '-U',
          'sightpace_test',
          '-d',
          'sightpace_test',
        ])
        ready = true
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    if (!ready) throw new Error('Fixture readiness timed out')

    async function migrate(url: string, config?: string) {
      await execute(
        process.execPath,
        [
          resolve('node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          ...(config ? ['--config', config] : []),
        ],
        { env: { ...process.env, DATABASE_URL: url }, timeout: 60_000 },
      )
    }

    // Upgrade a real auth-only database with existing synthetic records.
    await cp(
      'prisma/migrations/20261024000000_auth',
      join(temporary, 'migrations/20261024000000_auth'),
      { recursive: true },
    )
    await cp(
      'prisma/migrations/migration_lock.toml',
      join(temporary, 'migrations/migration_lock.toml'),
    )

    const config = join(temporary, 'prisma.config.ts')
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(join(temporary, 'migrations'))} }, datasource: { url: process.env.DATABASE_URL } }`,
    )

    stage = 'auth-only migration'

    await migrate(databaseUrl, config)

    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(
      `INSERT INTO "user" (id,name,email,"updatedAt") VALUES ('migration-sentinel','Synthetic migration user','migration@example.test',NOW())`,
    )

    stage = 'domain upgrade'

    const fullConfig = join(temporary, 'full-prisma.config.ts')
    await writeFile(
      fullConfig,
      `export default { schema: ${JSON.stringify(resolve('prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(resolve('prisma/migrations'))} }, datasource: { url: process.env.DATABASE_URL } }`,
    )

    await migrate(databaseUrl, fullConfig)
    await migrate(databaseUrl, fullConfig)

    const sentinel = await client.query(`SELECT id FROM "user" WHERE id = 'migration-sentinel'`)

    if (sentinel.rowCount !== 1) throw new Error('Migration did not preserve existing identity')

    // Also exercise the full chain in one deploy on a second empty database.
    stage = 'fresh migration chain'

    await client.query('CREATE DATABASE sightpace_fresh')

    const freshUrl = new URL(databaseUrl)
    freshUrl.pathname = '/sightpace_fresh'

    await migrate(freshUrl.toString(), fullConfig)

    await client.end()
    client = undefined

    project.provide('databaseUrl', databaseUrl)
    console.info('Disposable PostgreSQL: fresh apply, auth-data upgrade and repeat deploy passed.')
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string; code?: string }
    console.error(
      `Fixture failed at ${stage}: ${failure.code ?? 'unknown'}`,
      `${failure.stderr ?? ''} ${failure.stdout ?? ''}`
        .replaceAll(password, '[redacted]')
        .replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted URL]'),
    )

    await cleanup()
    throw new Error(
      'Disposable PostgreSQL setup failed. Check Docker availability, image access and reviewed migration SQL. No application database was used.',
    )
  }

  return cleanup
}
