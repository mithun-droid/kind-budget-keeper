
-- Family entity
CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  monthly_budget numeric NOT NULL CHECK (monthly_budget >= 1000 AND monthly_budget <= 10000000),
  alloc_fixed_bills int NOT NULL DEFAULT 30,
  alloc_daily_living int NOT NULL DEFAULT 40,
  alloc_shopping int NOT NULL DEFAULT 20,
  alloc_unplanned int NOT NULL DEFAULT 10,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alloc_fixed_bills + alloc_daily_living + alloc_shopping + alloc_unplanned = 100)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Members (created before policies that reference it)
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  linked_user_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','child','spouse')),
  individual_budget numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_members_family_idx ON public.family_members(family_id);
CREATE INDEX family_members_user_idx ON public.family_members(linked_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Helper: is _uid a member of _family?
CREATE OR REPLACE FUNCTION public.is_family_member(_family uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family AND linked_user_id = _uid
  );
$$;

-- Policies: families
CREATE POLICY "members read families" ON public.families
  FOR SELECT TO authenticated
  USING (public.is_family_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "auth create families" ON public.families
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "members update families" ON public.families
  FOR UPDATE TO authenticated
  USING (public.is_family_member(id, auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_family_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "members delete families" ON public.families
  FOR DELETE TO authenticated
  USING (public.is_family_member(id, auth.uid()) OR created_by = auth.uid());

-- Policies: family_members
CREATE POLICY "members read members" ON public.family_members
  FOR SELECT TO authenticated
  USING (
    linked_user_id = auth.uid()
    OR public.is_family_member(family_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.families f WHERE f.id = family_id AND f.created_by = auth.uid())
  );
CREATE POLICY "members insert members" ON public.family_members
  FOR INSERT TO authenticated
  WITH CHECK (
    linked_user_id = auth.uid()
    OR public.is_family_member(family_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.families f WHERE f.id = family_id AND f.created_by = auth.uid())
  );
CREATE POLICY "members update members" ON public.family_members
  FOR UPDATE TO authenticated
  USING (public.is_family_member(family_id, auth.uid()))
  WITH CHECK (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "members delete members" ON public.family_members
  FOR DELETE TO authenticated
  USING (public.is_family_member(family_id, auth.uid()));

-- Invites
CREATE TABLE public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_invites_code_idx ON public.family_invites(code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invites TO authenticated;
GRANT ALL ON public.family_invites TO service_role;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read invites" ON public.family_invites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "members create invites" ON public.family_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_family_member(family_id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "members delete invites" ON public.family_invites
  FOR DELETE TO authenticated
  USING (public.is_family_member(family_id, auth.uid()));

-- Extend transactions
ALTER TABLE public.transactions
  ADD COLUMN family_id uuid REFERENCES public.families(id) ON DELETE CASCADE,
  ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
CREATE INDEX transactions_family_idx ON public.transactions(family_id);

CREATE POLICY "family members read tx" ON public.transactions
  FOR SELECT TO authenticated
  USING (family_id IS NOT NULL AND public.is_family_member(family_id, auth.uid()));
CREATE POLICY "family members insert tx" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (family_id IS NOT NULL AND public.is_family_member(family_id, auth.uid()));
CREATE POLICY "family members update tx" ON public.transactions
  FOR UPDATE TO authenticated
  USING (family_id IS NOT NULL AND public.is_family_member(family_id, auth.uid()))
  WITH CHECK (family_id IS NOT NULL AND public.is_family_member(family_id, auth.uid()));
CREATE POLICY "family members delete tx" ON public.transactions
  FOR DELETE TO authenticated
  USING (family_id IS NOT NULL AND public.is_family_member(family_id, auth.uid()));

-- Touch triggers
CREATE TRIGGER families_touch BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
