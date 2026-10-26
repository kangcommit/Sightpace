import type { BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware, formCsrfMiddleware, getSession } from 'better-auth/api'
import { safeReturnPath, signInPath } from '@/lib/auth-redirect'
import { getAuthEnv } from '@/lib/env'
import { appRoutes } from '@/lib/routes'

export function authOptions(source: NodeJS.ProcessEnv = process.env) {
  const env = getAuthEnv(source)
  const base = new URL(env.BETTER_AUTH_URL)

  return {
    appName: 'TrailPlan',
    baseURL: base.origin,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [base.origin],
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ['openid', 'email', 'profile'],
        disableDefaultScope: true,
        includeGrantedScopes: false,
        accessType: 'online',
        prompt: 'select_account',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    disabledPaths: ['/link-social', '/unlink-account', '/get-access-token', '/refresh-token'],
    rateLimit: { enabled: true },
    logger: { disabled: true },
    onAPIError: {
      errorURL: `${base.origin}${appRoutes.signIn}?error=oauth`,
      throw: true,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const signingIn = ctx.path === '/sign-in/social'
        const callback = ctx.path?.startsWith('/callback/')

        if (!signingIn && !callback) return

        if (signingIn) await formCsrfMiddleware(ctx)

        // Read through the library directly so database errors fail closed rather than becoming null.
        const session = await getSession()({
          ...ctx,
          method: 'GET',
          asResponse: false,
          returnHeaders: false,
          returnStatus: false,
          headers: ctx.headers ?? ctx.request?.headers ?? new Headers(),
          query: { disableCookieCache: true, disableRefresh: true },
        })

        if (session) {
          if (callback) throw ctx.redirect(appRoutes.trips)

          throw new APIError('CONFLICT', {
            code: 'SIGN_OUT_REQUIRED',
            message: 'Sign out before signing in with another account.',
          })
        }

        if (!signingIn) return

        if (
          ctx.body?.provider !== 'google' ||
          ctx.body?.idToken ||
          ctx.body?.scopes ||
          ctx.body?.additionalParams
        ) {
          throw new APIError('BAD_REQUEST', { message: 'Use Google redirect sign-in.' })
        }

        const returnTo = safeReturnPath(ctx.body?.callbackURL)

        return {
          context: {
            body: {
              ...ctx.body,
              callbackURL: returnTo,
              newUserCallbackURL: returnTo,
              errorCallbackURL: signInPath(returnTo, true),
            },
          },
        }
      }),
    },
  } satisfies BetterAuthOptions
}
