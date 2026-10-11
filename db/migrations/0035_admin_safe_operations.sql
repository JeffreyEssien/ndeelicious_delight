-- Compare-and-set wrappers retain existing lifecycle/reservation rules and write
-- the required audit entry in the same transaction as each successful change.
create or replace function public.admin_advance_order(
 p_number text,p_expected_status text,p_admin_id uuid,p_session_id uuid
) returns text language plpgsql security invoker set search_path='' as $$
declare v_order public.orders; v_next text;
begin
 select * into v_order from public.orders where order_number=p_number for update;
 if not found then return 'NOT_FOUND'; end if;
 if v_order.status::text<>p_expected_status then return 'CONFLICT'; end if;
 v_next := case v_order.status
   when 'PAID' then 'CONFIRMED' when 'CONFIRMED' then 'PREPARING'
   when 'PREPARING' then 'READY' when 'READY' then
     case when v_order.fulfilment='pickup' then 'DELIVERED' else 'OUT_FOR_DELIVERY' end
   when 'OUT_FOR_DELIVERY' then 'DELIVERED' else null end;
 if v_next is null then return 'INELIGIBLE'; end if;
 perform public.admin_transition_order_status(p_number,v_next,p_admin_id);
 perform public.record_admin_audit(p_admin_id,p_session_id,'ORDER_BULK_ADVANCED','order',v_order.id::text,
   jsonb_build_object('status',v_order.status),jsonb_build_object('status',v_next),jsonb_build_object('orderNumber',p_number));
 return v_next;
end; $$;
revoke all on function public.admin_advance_order(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_advance_order(text,text,uuid,uuid) to service_role;

create or replace function public.admin_adjust_inventory(
 p_product_id uuid,p_variant_id uuid,p_expected integer,p_mode text,p_quantity integer,p_admin_id uuid,p_session_id uuid
) returns integer language plpgsql security invoker set search_path='' as $$
declare v_current integer; v_result bigint;
begin
 if p_mode not in ('add','remove','set') or p_quantity<0 or p_expected<0 then raise exception 'INVALID_QUANTITY'; end if;
 perform 1 from public.products where id=p_product_id for update;
 select stock_quantity into v_current from public.product_variants
   where id=p_variant_id and product_id=p_product_id for update;
 if not found then raise exception 'VARIANT_UNAVAILABLE'; end if;
 if v_current<>p_expected then raise exception 'INVENTORY_CHANGED'; end if;
 v_result := case p_mode when 'add' then v_current::bigint+p_quantity when 'remove' then v_current::bigint-p_quantity else p_quantity end;
 if v_result<0 or v_result>2147483647 then raise exception 'INVALID_QUANTITY'; end if;
 perform public.set_variant_inventory(p_product_id,p_variant_id,v_result::integer);
 perform public.record_admin_audit(p_admin_id,p_session_id,'INVENTORY_ADJUSTED','product_variant',p_variant_id::text,
   jsonb_build_object('stockQuantity',v_current),jsonb_build_object('stockQuantity',v_result),jsonb_build_object('mode',p_mode,'quantity',p_quantity));
 return v_result::integer;
end; $$;
revoke all on function public.admin_adjust_inventory(uuid,uuid,integer,text,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_adjust_inventory(uuid,uuid,integer,text,integer,uuid,uuid) to service_role;
