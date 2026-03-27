# Print Service Integration Research

Investigation for [GitHub Issue #39](https://github.com/amorris13/travelmaps/issues/39): how to integrate a printing service so users can order physical prints of their Veloprint posters.

---

## Summary

Veloprint already produces print-quality SVG output. The gaps are:
1. A print-on-demand (POD) service with a developer API to receive the image and ship to the customer
2. A payment flow to collect money from the user and pay the printer wholesale, keeping a margin

**Recommended service: [Gelato](https://www.gelato.com)** — 200+ countries, accepts SVG/PDF natively, free developer tier, best global coverage.

**Recommended payment processor: [Stripe](https://stripe.com)** — Checkout Sessions, webhook-driven order placement.

---

## Print-On-Demand Services Comparison

| Service | Ships To | Local Production | Poster Sizes | Accepted Formats | API Docs |
|---------|----------|-----------------|--------------|------------------|----------|
| **Gelato** ⭐ | 200+ countries | 32 countries, 140+ labs | 8×10" to 24×36"+ | JPG, PNG, **SVG**, PDF, HEIC | [dashboard.gelato.com/docs](https://dashboard.gelato.com/docs/) |
| **Prodigi** | Worldwide | 10+ countries, 50+ labs | 4×6" to 40×60" | JPG, PNG, PDF | [prodigi.com/print-api/docs](https://www.prodigi.com/print-api/docs/) |
| **Printful** | 200+ countries | 15 owned facilities | Posters + more | JPG, PNG | [printful.com/api](https://www.printful.com/api) |
| **Printify** | 200+ countries | Marketplace model | Posters + more | JPG, PNG | [developers.printify.com](https://developers.printify.com/) |

### Gelato (Recommended)

**Why Gelato:**
- Accepts **SVG and PDF natively** — Veloprint exports SVG, so no format conversion needed
- **200+ countries** shipping; 95% of orders produced in the same country as delivery (faster, cheaper)
- **140+ print partners** across 32 countries with local production: US, UK, Germany, France, Netherlands, Australia, Canada, Japan, India, Brazil, and more
- **No minimum order** — suitable for on-demand single prints
- Free developer tier; paid Gelato+ ($19.99/mo annually) gives 35% off products
- Sandbox/test mode: test orders are auto-cancelled and not charged

**Poster products:**
- Sizes: 8×10", 11×14", 18×24", 24×36" (and more in cm equivalents)
- Paper: 189 g/m² premium Japan-sourced paper, 0.26 mm thick, 94% opacity
- Optional: wood hangers (4 colours), frames (4 wood + 4 metal colours)

**API authentication:**
```
X-API-KEY: <your-api-key>
```
Generate key at: Gelato Dashboard → API Portal

**Sandbox:** Test orders are automatically cancelled and not fulfilled. Use separate API keys for test vs. production.

---

### Prodigi (Alternative)

**Why consider Prodigi:**
- Larger maximum poster sizes (up to 40×60")
- More paper options: Enhanced Matte Art, Museum Fine Art (Giclée), Budget Art, C-Type Photo
- Excellent sandbox environment (completely separate from live)
- Pro tier (£40/mo) gives 15% discount

**Limitation:** Does not accept SVG — would require server-side conversion to PNG or PDF before submission.

---

## Country Support

Both Gelato and Prodigi ship globally:

- **Gelato:** 200+ countries. Full list: [support.gelato.com/en/articles/8996117](https://support.gelato.com/en/articles/8996117-to-which-countries-do-you-deliver)
- **Prodigi:** Ships worldwide via 50+ print labs

For practical purposes, you can support **any country** your users are in. Local production in 32 countries (Gelato) means faster delivery and lower shipping costs for most markets.

---

## Payment Flow & Profit Margin

### How It Works

```
Customer                  Your App                  Gelato/Prodigi
    |                        |                            |
    |  1. Configure poster   |                            |
    |----------------------->|                            |
    |                        |                            |
    |  2. Stripe Checkout    |                            |
    |  (retail price)        |                            |
    |<---------------------->|                            |
    |                        |                            |
    |  3. Payment confirmed  |                            |
    |    (webhook)           |                            |
    |         Stripe ------->|                            |
    |                        |  4. Place order            |
    |                        |  (wholesale price)         |
    |                        |--------------------------->|
    |                        |                            |
    |                        |  5. Order confirmed        |
    |                        |<---------------------------|
    |  6. Confirmation email |                            |
    |<-----------------------|     (POD ships directly)   |
```

### Key Points

1. **Collect payment first** via Stripe before placing any POD order
2. **Stripe webhook** (`payment_intent.succeeded`) triggers the POD API call
3. **You keep:** retail price − wholesale cost − Stripe fees (~2.9% + $0.30)
4. **You never touch inventory** — POD ships directly to the customer

### Pricing Example

| Component | Amount |
|-----------|--------|
| Gelato wholesale (A2 poster, shipped EU) | ~$8–12 |
| Your retail price (40% markup) | ~$14–17 |
| Stripe fee (~3%) | ~$0.50 |
| **Your profit** | ~$3–5 per order |

With Gelato+ subscription (35% discount on products), margins improve significantly at volume.

### Pricing APIs

Both services expose pricing APIs so you can show accurate costs to users at checkout:

**Gelato — get shipping prices:**
```http
POST https://order.gelatoapis.com/v4/orders:quote
X-API-KEY: <key>
Content-Type: application/json

{
  "orderReferenceId": "preview",
  "customerReferenceId": "preview",
  "currency": "USD",
  "items": [{
    "itemReferenceId": "item-1",
    "productUid": "wall_art_product_poster_50x70-cm_ver",
    "quantity": 1,
    "fileUrl": "https://your-app.com/api/print/file/<id>"
  }],
  "shipmentMethodUid": "express",
  "shippingAddress": {
    "country": "US"
  }
}
```

---

## Technical Integration Plan

### Architecture Overview

```
web/
├── app/
│   └── api/
│       └── print/
│           ├── quote/route.ts        # GET shipping quote for country + size
│           ├── checkout/route.ts     # Create Stripe Checkout Session
│           ├── webhook/route.ts      # Stripe webhook → place POD order
│           └── order/[id]/route.ts  # Check order status
├── components/
│   ├── PrintOrderPanel.tsx           # Size selector, shipping address, checkout button
│   └── ExportButton.tsx              # Add "Order Print" alongside existing export buttons
└── lib/
    ├── print-service.ts              # Gelato/Prodigi API client
    └── stripe.ts                     # Stripe helpers
```

### New Environment Variables

```bash
# Gelato
GELATO_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Pricing
PRINT_MARKUP_PERCENTAGE=40      # profit margin percentage

# File hosting (for delivering image to POD API)
# Option A: Cloudflare R2 or AWS S3 (recommended)
S3_BUCKET=
S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Option B: Self-hosted signed URL (simpler, no extra service)
# Serve the generated PNG/PDF from /api/print/file/<token>
```

### Step 1: Export to Printable Format

The app already exports SVG. Gelato accepts SVG directly; however, for best print quality it's recommended to submit PDF or a high-resolution PNG (300 DPI at print size).

The existing `/api/export/route.ts` stub needs to be completed for server-side PNG/PDF rendering using `@resvg/resvg-js` (already noted as a TODO in the codebase):

```typescript
// web/src/app/api/export/route.ts (extend existing)
import { Resvg } from '@resvg/resvg-js'

export async function POST(req: Request) {
  const { svg, format, widthPx } = await req.json()

  if (format === 'png') {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: widthPx } })
    const png = resvg.render().asPng()
    return new Response(png, { headers: { 'Content-Type': 'image/png' } })
  }
  // ... PDF via pdf-lib
}
```

### Step 2: Gelato Order Submission

```typescript
// web/src/lib/print-service.ts
const GELATO_BASE = 'https://order.gelatoapis.com'

export async function placeGelatoOrder(params: {
  fileUrl: string          // publicly accessible URL of the print file
  productUid: string       // e.g. "wall_art_product_poster_50x70-cm_ver"
  quantity: number
  shippingAddress: Address
  orderRef: string         // your internal order ID
}) {
  const res = await fetch(`${GELATO_BASE}/v4/orders`, {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.GELATO_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderType: 'order',
      orderReferenceId: params.orderRef,
      customerReferenceId: params.orderRef,
      currency: 'USD',
      items: [{
        itemReferenceId: `${params.orderRef}-1`,
        productUid: params.productUid,
        quantity: params.quantity,
        fileUrl: params.fileUrl,
      }],
      shippingAddress: params.shippingAddress,
    }),
  })
  return res.json()
}
```

**Gelato Product UIDs for posters** (examples):
- `wall_art_product_poster_21x30-cm_ver` — A4 (8.3×11.7")
- `wall_art_product_poster_30x40-cm_ver` — 11.8×15.7"
- `wall_art_product_poster_50x70-cm_ver` — 19.7×27.6"
- `wall_art_product_poster_61x91_5-cm_ver` — 24×36"

Full product catalogue: Gelato API → `GET /v4/products`

### Step 3: Stripe Checkout

```typescript
// web/src/app/api/print/checkout/route.ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const { posterConfig, productUid, shippingAddress } = await req.json()

  // Get wholesale cost from Gelato quote API
  const quote = await getGelatoQuote(productUid, shippingAddress.country)
  const wholesaleCents = quote.items[0].price   // in cents
  const markupPct = Number(process.env.PRINT_MARKUP_PERCENTAGE ?? 40) / 100
  const retailCents = Math.ceil(wholesaleCents * (1 + markupPct))

  // Store order context for webhook
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Veloprint Print — Custom Poster' },
        unit_amount: retailCents,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/print/success?session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/create`,
    metadata: {
      productUid,
      posterConfigJson: JSON.stringify(posterConfig),
      shippingAddressJson: JSON.stringify(shippingAddress),
    },
  })

  return Response.json({ url: session.url })
}
```

### Step 4: Stripe Webhook → Place POD Order

```typescript
// web/src/app/api/print/webhook/route.ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Webhook signature invalid', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.CheckoutSession
    const { productUid, posterConfigJson, shippingAddressJson } = session.metadata!

    // 1. Render the poster to PNG server-side
    const posterConfig = JSON.parse(posterConfigJson)
    const fileUrl = await renderAndUploadPoster(posterConfig)  // upload to S3 / serve via signed URL

    // 2. Place order with Gelato
    await placeGelatoOrder({
      fileUrl,
      productUid,
      quantity: 1,
      shippingAddress: JSON.parse(shippingAddressJson),
      orderRef: session.payment_intent as string,
    })
  }

  return new Response('ok')
}
```

---

## Implementation Roadmap

| Phase | Work | Complexity |
|-------|------|-----------|
| **1. Export** | Complete server-side PNG rendering via `@resvg/resvg-js` | Small |
| **2. File hosting** | Serve print files via signed URL or upload to S3/R2 | Small–Medium |
| **3. Gelato client** | `print-service.ts` with quote + order endpoints | Small |
| **4. Stripe** | Checkout Session creation + webhook handler | Medium |
| **5. UI** | `PrintOrderPanel.tsx` — size picker, address form, checkout button | Medium |
| **6. Testing** | Stripe test mode + Gelato sandbox end-to-end | Medium |

---

## Getting Started

1. **Sign up for Gelato** at [gelato.com](https://www.gelato.com) → generate API key in dashboard
2. **Sign up for Stripe** at [stripe.com](https://stripe.com) → get publishable + secret keys
3. Install dependencies:
   ```bash
   cd web
   npm install stripe @stripe/stripe-js @resvg/resvg-js
   ```
4. Add environment variables (see above)
5. Implement phases 1–6 from the roadmap

---

## References

- [Gelato API Docs](https://dashboard.gelato.com/docs/)
- [Gelato Shipping Countries](https://support.gelato.com/en/articles/8996117-to-which-countries-do-you-deliver)
- [Gelato Poster Products](https://support.gelato.com/en/articles/8996200-start-selling-posters-and-framed-posters)
- [Gelato File Requirements](https://support.gelato.com/en/articles/8996346-in-what-format-can-i-upload-my-files)
- [Gelato Pricing](https://www.gelato.com/pricing)
- [Prodigi Print API Docs](https://www.prodigi.com/print-api/docs/reference/)
- [Prodigi Products — Prints & Posters](https://www.prodigi.com/products/prints-and-posters/)
- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Docs](https://stripe.com/docs/webhooks)
