import { vi } from "vitest";

export type StripeSubOverrides = {
  id?: string;
  customer?: string;
  status?: string;
  tenant?: string;
  priceId?: string;
  currentPeriodEnd?: number;
};

export function stripeSubscription(overrides: StripeSubOverrides = {}) {
  const tenant = overrides.tenant ?? "user-a";
  return {
    id: overrides.id ?? "sub_1",
    customer: overrides.customer ?? "cus_1",
    status: overrides.status ?? "active",
    metadata: { tenant },
    items: {
      data: [
        {
          current_period_end: overrides.currentPeriodEnd ?? 1_700_000_000,
          price: { id: overrides.priceId ?? "price_monthly" },
        },
      ],
    },
  };
}

export function mockStripeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://checkout.stripe.test/cs_test" })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://billing.stripe.test/bps_test" })),
      },
    },
    customers: {
      del: vi.fn(async () => ({ deleted: true, id: "cus_1" })),
    },
    webhooks: {
      constructEventAsync: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(async () => stripeSubscription()),
    },
  };
}

export function mockImportQueue() {
  return {
    send: vi.fn(async () => undefined),
  };
}

export function stubResendFetch(opts: { status?: number; body?: string } = {}) {
  const fetchMock = vi.fn(
    async () => new Response(opts.body ?? "{}", { status: opts.status ?? 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function parseResendCall(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  const call = fetchMock.mock.calls[index] as [string, RequestInit] | undefined;
  if (!call) throw new Error("Resend fetch was not called");
  const [url, init] = call;
  const headers = init.headers as Record<string, string>;
  const body = JSON.parse(String(init.body)) as {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    tags: Array<{ name: string; value: string }>;
  };
  return { url, headers, body };
}

export function queueMessage<T>(body: T) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    id: "msg-1",
    timestamp: new Date(),
    attempts: 1,
  };
}

export async function flushWaitUntil(ctx: ExecutionContext) {
  const pending = vi.mocked(ctx.waitUntil).mock.calls.map((call) => call[0]);
  await Promise.all(pending);
}
