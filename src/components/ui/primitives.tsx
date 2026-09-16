import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./icons";

export function Button({className="",variant="primary",...props}:ButtonHTMLAttributes<HTMLButtonElement> & {variant?:"primary"|"secondary"|"ghost"|"danger"}) {
  return <button className={`button button-${variant} ${className}`} {...props}/>;
}
export function Input({label,error,className="",...props}:InputHTMLAttributes<HTMLInputElement> & {label:string;error?:string}) {
  return <label className={`field ${className}`}><span>{label}</span><input aria-invalid={!!error} {...props}/>{error&&<small role="alert">{error}</small>}</label>;
}
export function Textarea({label,error,className="",...props}:TextareaHTMLAttributes<HTMLTextAreaElement> & {label:string;error?:string}) {
  return <label className={`field ${className}`}><span>{label}</span><textarea aria-invalid={!!error} {...props}/>{error&&<small role="alert">{error}</small>}</label>;
}
export function Select({label,error,className="",children,...props}:SelectHTMLAttributes<HTMLSelectElement> & {label:string;error?:string}) {
  return <label className={`field ${className}`}><span>{label}</span><select aria-invalid={!!error} {...props}>{children}</select>{error&&<small role="alert">{error}</small>}</label>;
}
export function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"success"|"warning"|"danger"|"berry"}) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Skeleton({className=""}:{className?:string}) { return <span className={`skeleton ${className}`} aria-hidden="true"/>; }
export function EmptyState({title,body,action}:{title:string;body:string;action?:React.ReactNode}) { return <div className="empty-state"><span>✦</span><h3>{title}</h3><p>{body}</p>{action}</div>; }
export function ErrorState({retry}:{retry?:()=>void}) { return <div className="empty-state error-state"><span>!</span><h3>Something went wrong</h3><p>We couldn’t load this just now. Please try again.</p>{retry&&<Button onClick={retry}>Try again</Button>}</div>; }
export function Checkbox({label,...props}:{label:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="check-row"><input type="checkbox" {...props}/><span>{label}</span></label>}
export function Radio({label,description,...props}:{label:string;description?:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="radio-card"><input type="radio" {...props}/><span><b>{label}</b>{description&&<small>{description}</small>}</span></label>}
export function Tabs({items,active,onChange}:{items:string[];active:string;onChange:(item:string)=>void}){return <div className="tabs" role="tablist">{items.map(item=><button key={item} role="tab" aria-selected={active===item} onClick={()=>onChange(item)}>{item}</button>)}</div>}
export function Pagination({page,pages,onChange}:{page:number;pages:number;onChange:(page:number)=>void}){if(pages<=1)return null;return <nav className="pagination" aria-label="Pagination"><button disabled={page===1} onClick={()=>onChange(page-1)} aria-label="Previous page">←</button>{Array.from({length:pages},(_,i)=>i+1).map(n=><button className={n===page?"active":""} aria-current={n===page?"page":undefined} onClick={()=>onChange(n)} key={n}>{n}</button>)}<button disabled={page===pages} onClick={()=>onChange(page+1)} aria-label="Next page">→</button></nav>}
export function Dialog({open,title,children,onClose}:{open:boolean;title:string;children:React.ReactNode;onClose:()=>void}){if(!open)return null;return <><button className="scrim" onClick={onClose} aria-label="Close dialog"/><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="panel-head"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button></div>{children}</section></>}
