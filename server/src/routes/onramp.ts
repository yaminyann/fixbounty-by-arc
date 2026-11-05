import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth, requireLinkedWallet } from '../auth.js'
import { parse, route } from '../lib/http.js'
import { rateLimit } from '../lib/limits.js'
import { createOnrampSession } from '../services/onramp.js'

/** Buying USDC with a card or bank. Needs a signed-in account with a linked wallet, which is where the USDC is sent. */
export const onrampRouter = Router()
onrampRouter.use(requireAuth, requireLinkedWallet)

const Body = z.object({
  /** Optional suggested amount in USD, for example "50". The widget still lets the user change it. */
  amount: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount like 50 or 49.99.')
    .optional(),
})

onrampRouter.post(
  '/session',
  rateLimit({ windowMs: 60_000, max: 6, key: (req) => `onramp:${req.user?.id ?? req.ip}` }),
  route(async (req: Request, res: Response) => {
    const { amount } = parse(Body, req.body ?? {})
    const session = await createOnrampSession({ userId: req.user!.id, wallet: req.wallet!, amount })
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(201).json(session)
  }),
)
