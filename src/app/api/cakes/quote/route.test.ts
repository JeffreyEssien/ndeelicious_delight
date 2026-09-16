import { describe,expect,it } from "vitest";import { POST } from "./route";
describe("POST /api/cakes/quote",()=>{it("rejects incomplete cake requests",async()=>{const res=await POST(new Request("http://localhost/api/cakes/quote",{method:"POST",body:JSON.stringify({occasion:"Birthday"})}));expect(res.status).toBe(400)})});
