This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase login setup

Copy `.env.example` to `.env.local` and set your Supabase project URL and publishable key. Create an email/password user in Supabase Auth before signing in at `/login`. The chat page at `/` requires a signed-in user.

Do not use a Supabase secret key for browser login.

## LINE chat setup

The workspace collects **new** LINE one-to-one messages after the webhook is enabled. The Messaging API cannot import old Official Account chat history. Incoming media is shown as an unsupported-message placeholder; outgoing messages are text only.

1. Apply [`supabase/migrations/202609300001_line_chat.sql`](supabase/migrations/202609300001_line_chat.sql) in your Supabase SQL Editor.
2. Set `SUPABASE_SECRET_KEY`, `LINE_CHANNEL_SECRET`, and `LINE_CHANNEL_ACCESS_TOKEN` in `.env.local` and in your deployed server environment. These are server-only secrets; never prefix them with `NEXT_PUBLIC_` or commit their values.
3. Deploy the app at a public HTTPS URL. In the LINE Developers Console, set the Messaging API webhook URL to `https://<your-domain>/api/line/webhook`, enable **Use webhook** and **Webhook redelivery**, then use **Verify**. The verification request has no events and should receive HTTP 200.
4. Send a text message to the Official Account from a LINE user. The contact and message should appear in the workspace within five seconds. Agent replies are sent through the composer using the LINE push API.

LINE's Basic settings contain the channel secret; its Messaging API settings provide the channel access token. The Supabase project API Keys page provides the secret key. If you use OA Manager automatic replies, configure them according to the replies you want customers to receive.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
