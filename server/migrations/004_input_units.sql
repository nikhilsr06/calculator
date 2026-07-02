-- 004_input_units.sql
-- Optional display unit per formula input variable (e.g. V, A, kg).

alter table formula_inputs
  add column if not exists unit text;
