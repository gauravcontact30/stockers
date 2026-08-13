-- Make `users.plan` mean "what this account bought", not "what tier to show it as".
--
-- Before this, the column was `not null default 'Starter'`, so every account that had never paid a
-- rupee was stored as a Starter subscriber. Nothing could tell a brand-new trial account apart
-- from a paying one — not the admin's user list, not the plan mix on the analytics page, and not a
-- human reading the table. The application now treats null as "has bought nothing", which is what
-- puts an account on the Application Users page rather than the Subscription Users one.
--
-- Safe to run more than once. Run it before deploying the build that writes nulls: the old
-- constraint rejects them, and sign-up is what would fail.

begin;

-- 1. Let the column hold null at all.
alter table public.users alter column plan drop not null;

-- 2. Stop stamping a plan on rows that never asked for one.
alter table public.users alter column plan drop default;

-- 3. Clear the placeholder off accounts that never actually bought Starter.
--
-- `subscribed_until is null` is the test for "no paid period has ever been recorded", which is the
-- only safe reading of the old data: a Starter row with a paid period behind it was a real
-- purchase and keeps its plan. Anything that has paid — now or in the past — is left alone, so no
-- paying customer loses the plan they bought.
update public.users
   set plan = null
 where plan = 'Starter'
   and subscribed_until is null;

commit;
