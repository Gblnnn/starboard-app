-- Fuel log IDs are UUIDs; keep petty-cash references and reservation RPCs aligned.
ALTER TABLE public.petty_cash_transaction
  ALTER COLUMN fuel_log_id TYPE uuid
  USING fuel_log_id::text::uuid;

DROP FUNCTION IF EXISTS public.pc_reserve_fuel_bills(bigint, bigint[]);

CREATE OR REPLACE FUNCTION public.pc_reserve_fuel_bills(
  p_submission_id bigint,
  p_fuel_log_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_updated_count integer;
  v_already_claimed uuid[];
BEGIN
  SELECT array_agg(id) INTO v_already_claimed
  FROM public.fuel_log
  WHERE id = ANY(p_fuel_log_ids)
    AND petty_cash_submission_id IS NOT NULL
    AND petty_cash_submission_id <> p_submission_id;

  IF v_already_claimed IS NOT NULL AND array_length(v_already_claimed, 1) > 0 THEN
    RAISE EXCEPTION 'Fuel bills % are already claimed by another submission', v_already_claimed;
  END IF;

  UPDATE public.fuel_log
  SET petty_cash_submission_id = p_submission_id
  WHERE id = ANY(p_fuel_log_ids)
    AND (petty_cash_submission_id IS NULL OR petty_cash_submission_id = p_submission_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object('reserved_count', v_updated_count);
END;
$$;

REVOKE ALL ON FUNCTION public.pc_reserve_fuel_bills(bigint, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pc_reserve_fuel_bills(bigint, uuid[]) TO authenticated;
