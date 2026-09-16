"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { BrandLogo } from "@/components/layout/brand-logo";

const links=[{label:"Dashboard",href:"/admin",icon:"grid"},{label:"Orders",href:"/admin/orders",icon:"orders"},{label:"Custom cakes",href:"/admin/custom-cakes",icon:"heart"},{label:"Products",href:"/admin/products",icon:"box"},{label:"Inventory",href:"/admin/inventory",icon:"grid"},{label:"Customers",href:"/admin/customers",icon:"user"},{label:"Coupons",href:"/admin/coupons",icon:"coupon"},{label:"Reviews",href:"/admin/reviews",icon:"heart"},{label:"Content",href:"/admin/content",icon:"orders"},{label:"Delivery",href:"/admin/delivery",icon:"truck"},{label:"Settings",href:"/admin/settings",icon:"settings"}];

export function AdminShell({children}:{children:React.ReactNode}){
  const path=usePathname();const [mobile,setMobile]=useState(false);
  if(path==="/admin/login")return <>{children}</>;
  return <div className="admin-shell"><aside className={`admin-sidebar ${mobile?"is-open":""}`}><div className="admin-brand"><span className="brand brand-light"><BrandLogo compact/></span><button className="icon-button mobile-only" onClick={()=>setMobile(false)}><Icon name="close"/></button></div><nav>{links.map(l=><Link className={path===l.href?"active":""} href={l.href} key={l.href} onClick={()=>setMobile(false)}><Icon name={l.icon}/><span>{l.label}</span>{l.label==="Orders"&&<b>4</b>}</Link>)}</nav><div className="admin-user"><span>NA</span><div><b>Ndeeelicious Admin</b><small>Owner</small></div><form action="/api/auth/admin/logout" method="post"><button type="submit" aria-label="Sign out"><Icon name="logout"/></button></form></div></aside><div className="admin-content"><header className="admin-topbar"><button className="icon-button mobile-only" onClick={()=>setMobile(true)}><Icon name="menu"/></button><div className="admin-search"><Icon name="search"/><input aria-label="Search admin" placeholder="Search orders, products, customers…"/></div><div><a href="/" target="_blank">View storefront ↗</a><button className="notification-dot" aria-label="Notifications">3</button></div></header><main>{children}</main></div>{mobile&&<button className="scrim mobile-only" onClick={()=>setMobile(false)}/>}</div>
}
