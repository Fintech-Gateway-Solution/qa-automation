/**
 * QA test-data cleanup. Deletes only entities that match BOTH a name prefix
 * AND a `@test.local` (or analogous) email pattern, so a real user named
 * "QA Smith" with a real-domain email can never get caught.
 *
 * Used both as a CLI (`scripts/cleanup-qa-data.ts`) and as Playwright
 * `globalTeardown` so every test run self-purges.
 */
import type { APIRequestContext } from '@playwright/test';

export interface CleanupOptions {
  baseURL: string;
  email: string;
  password: string;
  dryRun: boolean;
  log?: (msg: string) => void;
  /** Pass an existing APIRequestContext (e.g. from globalTeardown). If absent the
   *  caller should provide one; we don't import @playwright/test at module load. */
  request: APIRequestContext;
}

export interface CleanupResult {
  payees: { matched: number; deleted: number; failed: number };
  fundingAccounts: { matched: number; deleted: number; failed: number };
  purchaseOrders: { matched: number; deleted: number; failed: number };
  users: { matched: number; deleted: number; failed: number };
  customers: { matched: number; deleted: number; failed: number };
  notes: string[];
}

const QA_VENDOR_EMAIL_RE = /^qa-(payee|vendor|whvendor)-[a-z0-9]+@test\.local$/i;
const QA_USER_EMAIL_RE = /^qa-user-[a-z0-9]+@test\.local$/i;
const QA_CUSTOMER_EMAIL_RE = /^qa-customer-[a-z0-9]+@test\.local$/i;
const QA_FUNDING_NICKNAME_PREFIX = 'QA-Funding-';
const QA_FUNDING_HOLDER_PREFIX = 'QA Funding ';
const QA_PO_CREATED_BY = 'QA Automation';

export async function cleanupQaData(opts: CleanupOptions): Promise<CleanupResult> {
  const log = opts.log ?? ((m) => console.log(m));
  const result: CleanupResult = {
    payees: { matched: 0, deleted: 0, failed: 0 },
    fundingAccounts: { matched: 0, deleted: 0, failed: 0 },
    purchaseOrders: { matched: 0, deleted: 0, failed: 0 },
    users: { matched: 0, deleted: 0, failed: 0 },
    customers: { matched: 0, deleted: 0, failed: 0 },
    notes: [],
  };

  // Authenticate. Cookies stay on the request context.
  const login = await opts.request.post('/auth-api/v1/auth/login', {
    data: { email: opts.email, password: opts.password },
  });
  if (!login.ok()) {
    throw new Error(`cleanup login failed: ${login.status()} ${await login.text()}`);
  }
  log(`[cleanup] logged in as ${opts.email} on ${opts.baseURL} (${opts.dryRun ? 'DRY-RUN' : 'EXECUTE'})`);

  // ─── Dashboard payees / vendors ─────────────────────────────────────────
  // Match: name starts with "QA-" AND email matches qa-(payee|vendor|whvendor)-…@test.local.
  // Pagination: walk the list with perPage=100 until we run out.
  const targetPayees: Array<{ id: string; name: string; email: string }> = [];
  for (let page = 1; ; page++) {
    const res = await opts.request.get('/api/v1/payees', { params: { page: String(page), perPage: '100' } });
    if (!res.ok()) {
      result.notes.push(`payees list failed at page ${page}: ${res.status()}`);
      break;
    }
    const body = await res.json();
    const rows: any[] = body.data ?? [];
    if (rows.length === 0) break;
    for (const p of rows) {
      const name: string = p.name ?? '';
      const email: string = p.email ?? '';
      if (name.startsWith('QA-') && QA_VENDOR_EMAIL_RE.test(email)) {
        targetPayees.push({ id: p.id, name, email });
      }
    }
    if (rows.length < 100) break;
  }
  result.payees.matched = targetPayees.length;
  log(`[cleanup] payees matched: ${targetPayees.length}`);
  for (const p of targetPayees) {
    log(`  ${opts.dryRun ? '(dry)' : 'DELETE'} payee ${p.id} | ${p.name} <${p.email}>`);
    if (opts.dryRun) continue;
    const res = await opts.request.delete(`/api/v1/payees/${p.id}`);
    if (res.ok() || res.status() === 404) {
      result.payees.deleted++;
    } else {
      result.payees.failed++;
      result.notes.push(`payee delete ${p.id} -> ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // ─── SendPayment funding accounts ───────────────────────────────────────
  // Match: nickname starts with "QA-Funding-" AND accountHolderName starts with "QA Funding ".
  // The list endpoint accepts an optional ?locationId — without it we get all.
  const targetFunding: Array<{ id: string; nickname: string; holder: string }> = [];
  {
    const res = await opts.request.get('/sp-api/v1/funding-accounts');
    if (res.ok()) {
      const body = await res.json();
      const rows: any[] = body.data ?? body ?? [];
      for (const f of rows) {
        const nick: string = f.nickname ?? '';
        const holder: string = f.accountHolderName ?? '';
        if (nick.startsWith(QA_FUNDING_NICKNAME_PREFIX) && holder.startsWith(QA_FUNDING_HOLDER_PREFIX)) {
          targetFunding.push({ id: f.id, nickname: nick, holder });
        }
      }
    } else {
      result.notes.push(`funding-accounts list failed: ${res.status()}`);
    }
  }
  result.fundingAccounts.matched = targetFunding.length;
  log(`[cleanup] funding accounts matched: ${targetFunding.length}`);
  for (const f of targetFunding) {
    log(`  ${opts.dryRun ? '(dry)' : 'DELETE'} funding ${f.id} | ${f.nickname} (holder: ${f.holder})`);
    if (opts.dryRun) continue;
    const res = await opts.request.delete(`/sp-api/v1/funding-accounts/${f.id}`);
    if (res.ok() || res.status() === 404) {
      result.fundingAccounts.deleted++;
    } else {
      result.fundingAccounts.failed++;
      result.notes.push(`funding delete ${f.id} -> ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // ─── Purchase orders ────────────────────────────────────────────────────
  // Match: createdByName === "QA Automation" (set by qaPurchaseOrder).
  // Drafts → DELETE; sent/anything else → POST /cancel (DELETE rejects non-draft).
  const targetPos: Array<{ id: string; orderNumber: number; status: string; createdByName: string }> = [];
  for (let page = 1; ; page++) {
    const res = await opts.request.get('/api/v1/purchase-orders', { params: { page: String(page), perPage: '100' } });
    if (!res.ok()) {
      result.notes.push(`purchase-orders list failed at page ${page}: ${res.status()}`);
      break;
    }
    const body = await res.json();
    const rows: any[] = body.data ?? [];
    if (rows.length === 0) break;
    for (const po of rows) {
      if (po.createdByName === QA_PO_CREATED_BY) {
        targetPos.push({ id: po.id, orderNumber: po.orderNumber, status: po.status, createdByName: po.createdByName });
      }
    }
    if (rows.length < 100) break;
  }
  result.purchaseOrders.matched = targetPos.length;
  log(`[cleanup] purchase orders matched: ${targetPos.length}`);
  for (const po of targetPos) {
    const action = po.status === 'draft' ? 'delete' : 'cancel';
    log(`  ${opts.dryRun ? '(dry)' : action.toUpperCase()} PO #${po.orderNumber} (${po.status}) ${po.id}`);
    if (opts.dryRun) continue;
    let res;
    if (action === 'delete') {
      res = await opts.request.delete(`/api/v1/purchase-orders/${po.id}`);
    } else {
      res = await opts.request.post(`/api/v1/purchase-orders/${po.id}/cancel`, {
        data: { reason: 'QA cleanup' },
      });
    }
    if (res.ok() || res.status() === 404) {
      result.purchaseOrders.deleted++;
    } else {
      result.purchaseOrders.failed++;
      result.notes.push(`PO ${action} ${po.id} -> ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // ─── Auth users ─────────────────────────────────────────────────────────
  // Match: email matches /^qa-user-…@test\.local$/i. Hard-delete via the
  // owner-gated endpoint added specifically for QA cleanup.
  const targetUsers: Array<{ id: string; email: string; name?: string }> = [];
  for (let page = 1; ; page++) {
    const res = await opts.request.get('/auth-api/v1/users', { params: { page: String(page), perPage: '100' } });
    if (!res.ok()) {
      result.notes.push(`users list failed at page ${page}: ${res.status()}`);
      break;
    }
    const body = await res.json();
    const rows: any[] = body.data ?? [];
    if (rows.length === 0) break;
    for (const u of rows) {
      const email: string = u.email ?? '';
      if (QA_USER_EMAIL_RE.test(email)) targetUsers.push({ id: u.id, email, name: u.name });
    }
    if (rows.length < 100) break;
  }
  result.users.matched = targetUsers.length;
  log(`[cleanup] users matched: ${targetUsers.length}`);
  for (const u of targetUsers) {
    log(`  ${opts.dryRun ? '(dry)' : 'DELETE'} user ${u.id} | <${u.email}>`);
    if (opts.dryRun) continue;
    const res = await opts.request.delete(`/auth-api/v1/users/${u.id}`);
    if (res.ok() || res.status() === 404 || res.status() === 204) {
      result.users.deleted++;
    } else {
      result.users.failed++;
      result.notes.push(`user delete ${u.id} -> ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // ─── ReceivePayment customers ───────────────────────────────────────────
  // Match: name starts with "QA-Customer-" AND email matches /^qa-customer-…@test\.local$/i.
  // 409 from server (CUSTOMER_HAS_INVOICES) is treated as a soft-fail with note.
  const targetCustomers: Array<{ id: string; name: string; email: string }> = [];
  {
    const res = await opts.request.get('/rp-api/v1/customers');
    if (res.ok()) {
      const body = await res.json();
      const rows: any[] = body.data ?? [];
      for (const c of rows) {
        const name: string = c.name ?? '';
        const email: string = c.email ?? '';
        if (name.startsWith('QA-Customer-') && QA_CUSTOMER_EMAIL_RE.test(email)) {
          targetCustomers.push({ id: c.id, name, email });
        }
      }
    } else {
      result.notes.push(`customers list failed: ${res.status()}`);
    }
  }
  result.customers.matched = targetCustomers.length;
  log(`[cleanup] customers matched: ${targetCustomers.length}`);
  for (const c of targetCustomers) {
    log(`  ${opts.dryRun ? '(dry)' : 'DELETE'} customer ${c.id} | ${c.name} <${c.email}>`);
    if (opts.dryRun) continue;
    const res = await opts.request.delete(`/rp-api/v1/customers/${c.id}`);
    if (res.ok() || res.status() === 404 || res.status() === 204) {
      result.customers.deleted++;
    } else {
      result.customers.failed++;
      result.notes.push(`customer delete ${c.id} -> ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }

  // ─── Things we don't touch and why ──────────────────────────────────────
  result.notes.push(
    'skipped: products (DELETE is soft-deactivate; QA-LowThreshold-* products are intentionally preserved as fixtures).',
  );

  log(
    `[cleanup] done. payees: ${result.payees.matched}/${result.payees.deleted}/${result.payees.failed}. ` +
      `funding: ${result.fundingAccounts.matched}/${result.fundingAccounts.deleted}/${result.fundingAccounts.failed}. ` +
      `POs: ${result.purchaseOrders.matched}/${result.purchaseOrders.deleted}/${result.purchaseOrders.failed}. ` +
      `users: ${result.users.matched}/${result.users.deleted}/${result.users.failed}. ` +
      `customers: ${result.customers.matched}/${result.customers.deleted}/${result.customers.failed}.`,
  );
  return result;
}
