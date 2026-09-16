"use client";
import { FormEvent, useState } from "react";
export function NewsletterForm(){
  const [email,setEmail]=useState("");const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{const response=await fetch("/api/newsletter",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});const payload=await response.json();if(!response.ok)throw new Error(payload.error);setDone(true)}catch(reason){setError(reason instanceof Error?reason.message:"Please try again.")}finally{setBusy(false)}}
  if(done)return <p className="newsletter-success">✓ You’re on the list. Welcome.</p>;
  return <form className="newsletter-form" onSubmit={submit}><label className="sr-only" htmlFor="newsletter-email">Email address</label><input id="newsletter-email" type="email" required placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/><button disabled={busy} aria-label="Subscribe">{busy?"…":"→"}</button>{error&&<small role="alert">{error}</small>}</form>
}
