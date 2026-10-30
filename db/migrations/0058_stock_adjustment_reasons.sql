-- Stock adjustments can say why ("Baked a batch", "Damaged"), so the stock history reads as
-- a story rather than bare numbers. The reason is optional and stored with the audit entry.
begin;
drop function public.admin_adjust_inventory(uuid,uuid,integer,text,integer,uuid,uuid);
create function public.admin_adjust_inventory(
 p_product_id uuid,p_variant_id uuid,p_expected integer,p_mode text,p_quantity integer,p_admin_id uuid,p_session_id uuid,
 p_reason text default null
) returns integer language plpgsql security invoker set search_path='' as $$
declare v_current integer; v_result bigint; v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
 if p_mode not in ('add','remove','set') or p_quantity<0 or p_expected<0 then raise exception 'INVALID_QUANTITY'; end if;
 if char_length(coalesce(v_reason,''))>200 then raise exception 'INVALID_REASON'; end if;
 perform 1 from public.products where id=p_product_id for update;
 select stock_quantity into v_current from public.product_variants
   where id=p_variant_id and product_id=p_product_id for update;
 if not found then raise exception 'VARIANT_UNAVAILABLE'; end if;
 if v_current<>p_expected then raise exception 'INVENTORY_CHANGED'; end if;
 v_result := case p_mode when 'add' then v_current::bigint+p_quantity when 'remove' then v_current::bigint-p_quantity else p_quantity end;
 if v_result<0 or v_result>2147483647 then raise exception 'INVALID_QUANTITY'; end if;
 perform public.set_variant_inventory(p_product_id,p_variant_id,v_result::integer);
 perform public.record_admin_audit(p_admin_id,p_session_id,'INVENTORY_ADJUSTED','product_variant',p_variant_id::text,
   jsonb_build_object('stockQuantity',v_current),jsonb_build_object('stockQuantity',v_result),
   jsonb_strip_nulls(jsonb_build_object('mode',p_mode,'quantity',p_quantity,'reason',v_reason)));
 return v_result::integer;
end; $$;
revoke all on function public.admin_adjust_inventory(uuid,uuid,integer,text,integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_adjust_inventory(uuid,uuid,integer,text,integer,uuid,uuid,text) to service_role;
commit;
