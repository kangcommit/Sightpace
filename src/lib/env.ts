import { z } from 'zod'

type EnvironmentSource = Readonly<Record<string, string | undefined>>

const required = z.string({ error: 'is required' }).refine((value) => value.trim().length > 0, {
  error: 'must not be blank',
})

const databaseSchema = z.object({
  DATABASE_URL: required.refine(
    (value) => {
      try {
        const url = new URL(value)
        return ['postgres:', 'postgresql:'].includes(url.protocol) && Boolean(url.hostname)
      } catch {
        return false
      }
    },
    { error: 'must be a PostgreSQL connection URL' },
  ),
})

const authSchema = databaseSchema
  .extend({
    NODE_ENV: z
      .enum(['development', 'test', 'production'], {
        error: 'must be development, test or production',
      })
      .default('development'),
    BETTER_AUTH_URL: required,
    BETTER_AUTH_SECRET: required.refine((value) => value.length >= 32, {
      error: 'must contain at least 32 characters',
    }),
    GOOGLE_CLIENT_ID: required,
    GOOGLE_CLIENT_SECRET: required,
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  })
  .superRefine((env, context) => {
    let base: URL
    try {
      base = new URL(env.BETTER_AUTH_URL)
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'must be an exact HTTPS origin (HTTP loopback allowed outside production)',
      })
      return
    }

    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== '/' ||
      !(
        base.protocol === 'https:' ||
        (env.NODE_ENV !== 'production' &&
          base.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'must be an exact HTTPS origin (HTTP loopback allowed outside production)',
      })
    }

    if (env.BETTER_AUTH_TRUSTED_ORIGINS && env.BETTER_AUTH_TRUSTED_ORIGINS !== base.origin) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_TRUSTED_ORIGINS'],
        message: 'must be unset or match BETTER_AUTH_URL exactly',
      })
    }
  })

function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: EnvironmentSource,
): z.output<Schema> {
  const result = schema.safeParse(source)
  if (!result.success) {
    // All schema messages are static. Never throw ZodError or attach its input/issues as a cause.
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid server environment: ${issues.join('; ')}`)
  }

  return result.data
}

/** Server consumers only. Importing this module does not read or validate runtime configuration. */
export function getDatabaseEnv(source: EnvironmentSource = process.env) {
  return parseEnv(databaseSchema, source)
}

export function getAuthEnv(source: EnvironmentSource = process.env) {
  return parseEnv(authSchema, source)
}
