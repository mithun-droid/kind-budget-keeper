CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  category public.expense_category NOT NULL,
  note text,
  frequency text NOT NULL DEFAULT 'monthly',
  day_of_month integer,
  day_of_week integer,
  start_date date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_frequency_valid CHECK (frequency IN ('monthly','weekly')),
  CONSTRAINT recurring_day_of_month_valid CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  CONSTRAINT recurring_day_of_week_valid CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO service_role;

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own recurring expenses"
ON public.recurring_expenses FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER recurring_expenses_touch
BEFORE UPDATE ON public.recurring_expenses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.transactions
  ADD COLUMN recurring_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;

CREATE INDEX idx_recurring_expenses_user ON public.recurring_expenses(user_id);
CREATE INDEX idx_transactions_recurring ON public.transactions(recurring_id);