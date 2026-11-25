import { describe, it, expect } from 'vitest'
import {observe,authorOf,ReaderSubscriptions} from '../../src/library/reader-subscriptions'
import type {LibraryDatabase} from '../../src/library/database'
const base={comicId:'old',author:'Sample Artist',title:'Old',categories:[],tags:[],finished:false,epsCount:7}
describe('desktop reading subscriptions',()=>{
 it('does not announce the backlog, metadata edits, or substitute a missing count for a chapter',()=>{
  const f={...authorOf(base)!,since:Date.UTC(2020,0),known:{},pending:{}};observe(f,base);observe(f,{...base,title:'Revised'});expect(f.pending).toEqual({})
  observe(f,{...base,epsCount:10});expect(f.pending).toEqual({old:{title:'Old',chapters:[8,9,10]}})
  observe(f,{...base,comicId:'unknown',epsCount:0});observe(f,{...base,comicId:'unknown',epsCount:40});expect(Object.keys(f.pending)).toEqual(['old'])
  observe(f,{...base,comicId:'new',createdAt:'2021-01-01',epsCount:1});expect(f.pending).toHaveProperty('new.chapters',[1])
 })
 it('keeps unread chapters across restart/offline; acknowledging another chapter has no effect',async()=>{
  const state=new Map();const db={getAppState:(k:string)=>structuredClone(state.get(k)),setAppState:(k:string,v:unknown)=>state.set(k,structuredClone(v)),getComicsByIds:()=>[base],listComics:()=>[base]} as unknown as LibraryDatabase
  const s=new ReaderSubscriptions(db,async()=>[{...base,epsCount:9}]);s.follow('old');await s.refresh(true);expect(s.view().updates[0].chapters).toEqual([8,9])
  const next=new ReaderSubscriptions(db,async()=>{throw Error('offline')});await next.refresh(true);next.acknowledge('old',7);expect(next.view().updates[0].chapters).toEqual([8,9]);next.acknowledge('old',8);expect(next.view().updates[0].chapters).toEqual([9]);next.unfollow(authorOf(base)!.id);expect(next.view().updates).toEqual([])
 })
})
