-- ---------------------------------------------------------------------------
-- OHMY AI ERP — Row Level Security for Supabase
--
-- The application already enforces these rules server-side: every request query
-- is AND-ed with a visibility predicate (src/lib/rbac.ts), and no query runs
-- without a validated session. These policies are the *backstop* — they make the
-- same rules hold for anything that reaches Postgres directly (PostgREST, a
-- future service, a psql session using the anon key).
--
-- Deliberately redundant: if a future query forgets the predicate, RLS still
-- refuses the row.
--
-- Apply AFTER the schema migration:
--   psql "$DATABASE_URL" -f database/rls.sql
-- or paste into the Supabase SQL editor.
--
-- Assumes Supabase Auth, where auth.uid() returns the authenticated user id and
-- public.users.id is set to that same value. If you keep the built-in credential
-- auth instead, the application layer is the enforcement point and these policies
-- are inert (no JWT is presented to Postgres).
-- ---------------------------------------------------------------------------

-- Helper: the employee row for the current JWT.
create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select employee_id from public.users where id = auth.uid()
$$;

create or replace function public.current_department_id()
returns uuid language sql stable security definer set search_path = public as $$
  select e.department_id from public.users u
  join public.employees e on e.id = u.employee_id
  where u.id = auth.uid()
$$;

create or replace function public.current_has_role(target text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = target)
$$;

create or replace function public.current_sees_everything()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('SUPER_ADMIN','ADMIN','DIRECTOR','AUDITOR')
  )
$$;

-- ---------------------------------------------------------------------------
-- requests — the base table every other rule hangs off
-- ---------------------------------------------------------------------------
alter table public.requests enable row level security;

drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests for select using (
  public.current_sees_everything()
  or requester_id = public.current_employee_id()
  or exists (
    select 1 from public.approval_steps s
    where s.request_id = requests.id and s.approver_id = public.current_employee_id()
  )
  or (public.current_has_role('MANAGER') and department_id = public.current_department_id())
  or (public.current_has_role('HR') and request_type in ('LEAVE','HR'))
  or (public.current_has_role('FINANCE') and request_type in ('EXPENSE','PURCHASE'))
);

-- Only the requester creates their own requests.
drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert with check (
  requester_id = public.current_employee_id()
);

-- The requester may edit only while the request is still open to change; an
-- approver may move it along. Terminal states are immutable.
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update using (
  (requester_id = public.current_employee_id() and status in ('DRAFT','RETURNED','SUBMITTED','IN_REVIEW'))
  or exists (
    select 1 from public.approval_steps s
    where s.request_id = requests.id
      and s.step_order = requests.current_step_order
      and s.approver_id = public.current_employee_id()
  )
  or public.current_has_role('SUPER_ADMIN')
);

-- ---------------------------------------------------------------------------
-- Detail tables inherit visibility from their parent request
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'leave_requests','business_trips','purchase_requests','expense_claims',
    'generic_requests','attachments','comments','ai_reviews','approval_steps','approval_actions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format($f$
      create policy %I_select on public.%I for select using (
        exists (select 1 from public.requests r where r.id = %I.request_id)
      )$f$, t, t, t);
  end loop;
end $$;

-- Note: the sub-select above relies on the requests policy — a row is only
-- visible if its parent request is visible, because RLS applies to that lookup too.

-- Child-of-child tables key off their own parent.
alter table public.trip_travelers enable row level security;
drop policy if exists trip_travelers_select on public.trip_travelers;
create policy trip_travelers_select on public.trip_travelers for select using (
  exists (select 1 from public.business_trips bt where bt.id = trip_travelers.trip_id)
);

alter table public.trip_costs enable row level security;
drop policy if exists trip_costs_select on public.trip_costs;
create policy trip_costs_select on public.trip_costs for select using (
  exists (select 1 from public.business_trips bt where bt.id = trip_costs.trip_id)
);

alter table public.purchase_items enable row level security;
drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items for select using (
  exists (select 1 from public.purchase_requests pr where pr.id = purchase_items.purchase_request_id)
);

alter table public.expense_items enable row level security;
drop policy if exists expense_items_select on public.expense_items;
create policy expense_items_select on public.expense_items for select using (
  exists (select 1 from public.expense_claims ec where ec.id = expense_items.claim_id)
);

-- ---------------------------------------------------------------------------
-- People and leave
-- ---------------------------------------------------------------------------
alter table public.employees enable row level security;
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (
  public.current_sees_everything()
  or public.current_has_role('HR')
  or id = public.current_employee_id()
  or (public.current_has_role('MANAGER') and department_id = public.current_department_id())
);

alter table public.leave_balances enable row level security;
drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances for select using (
  public.current_sees_everything()
  or public.current_has_role('HR')
  or employee_id = public.current_employee_id()
);

-- Notifications are strictly personal.
alter table public.notifications enable row level security;
drop policy if exists notifications_all on public.notifications;
create policy notifications_all on public.notifications for all using (
  employee_id = public.current_employee_id()
);

-- AI conversations are strictly personal.
alter table public.ai_conversations enable row level security;
drop policy if exists ai_conversations_all on public.ai_conversations;
create policy ai_conversations_all on public.ai_conversations for all using (
  employee_id = public.current_employee_id()
);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
alter table public.budgets enable row level security;
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets for select using (
  public.current_sees_everything()
  or public.current_has_role('FINANCE')
  or (public.current_has_role('MANAGER') and department_id = public.current_department_id())
);

-- ---------------------------------------------------------------------------
-- Audit log — readable by oversight roles, never updatable or deletable
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select using (
  public.current_sees_everything()
);
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert with check (true);
-- No update or delete policy exists, so the log is append-only even for admins.

-- ---------------------------------------------------------------------------
-- Reference data — readable by any signed-in user, written only by admins
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'offices','departments','teams','cost_centers','vendors','holidays',
    'exchange_rates','policies','approval_workflows','approval_workflow_steps','system_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$
      create policy %I_write on public.%I for all using (
        public.current_has_role('ADMIN') or public.current_has_role('SUPER_ADMIN')
      )$f$, t, t);
  end loop;
end $$;
