import {it,expect} from 'vitest';
import {collectPages} from '../src/lib/pagination';
it('loads every record beyond the REST row cap, even with a smaller server page limit',async()=>{const rows=Array.from({length:2043},(_,i)=>({id:String(i).padStart(5,'0'),amount_cents:1}));const all=await collectPages(async after=>rows.filter(r=>after===null||r.id>after).slice(0,137));expect(all).toHaveLength(2043);expect(all.reduce((n,r)=>n+r.amount_cents,0)).toBe(2043);});
it('does not loop indefinitely if the backend ignores the pagination cursor',async()=>{await expect(collectPages(async()=>[{id:'same'}])).rejects.toThrow('did not advance');});
