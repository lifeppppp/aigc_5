import asyncio
import importlib.util
import json
import sys
import tempfile
import types
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/"sentinel"

async def run():
 with tempfile.TemporaryDirectory() as tmp:
  home=Path(tmp)
  cfg=types.ModuleType('config')
  cfg.HOME=home;cfg.MEMBERS=home/'members.json'
  cfg.read_members=lambda:json.loads(cfg.MEMBERS.read_text())['members'] if cfg.MEMBERS.exists() else []
  cfg.token_for=lambda name:next((m['token'] for m in cfg.read_members() if m['name']==name),'')
  cfg.label_for=lambda name:next((m['label'] for m in cfg.read_members() if m['name']==name),'')
  sys.modules['config']=cfg
  spec=importlib.util.spec_from_file_location('accounts_candidate',ROOT/'accounts.py')
  accounts=importlib.util.module_from_spec(spec);spec.loader.exec_module(accounts)
  first=accounts.register('tester','old-password','测试者')
  accounts.register('occupied','another-password','另一账号')
  app=FastAPI()
  def verify(x_client_token:str=Header(default='')):
   member=next((m['name'] for m in cfg.read_members() if m['token']==x_client_token),'')
   if not member:raise HTTPException(401,'令牌无效')
   return member
  scope=dict(app=app,accounts=accounts,BaseModel=BaseModel,Depends=Depends,HTTPException=HTTPException,verify=verify)
  source=(ROOT/'api.py').read_text(encoding='utf-8-sig')
  exec(source[source.index('class ProfileUpdate'):],scope)
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
   headers={'X-Client-Token':first['token']}
   async def post(path,data,expected=200):
    response=await client.post(path,json=data,headers=headers)
    assert response.status_code==expected,(path,response.text)
    return response.json()
   assert (await client.post('/api/account/profile',json={'label':'x'})).status_code==401
   await post('/api/account/profile',{'label':'新名称'})
   assert cfg.label_for('tester')=='新名称'
   await post('/api/account/name',{'username':'newtester','current_password':'wrong'},400)
   await post('/api/account/name',{'username':'occupied','current_password':'old-password'},400)
   await post('/api/account/name',{'username':'newtester','current_password':'old-password'})
   assert accounts.login('newtester','old-password')['member']=='tester'
   assert cfg.token_for('tester')==first['token']
   await post('/api/account/password',{'current_password':'old-password','new_password':'short'},400)
   await post('/api/account/password',{'current_password':'old-password','new_password':'new-password'})
   try:accounts.login('newtester','old-password')
   except accounts.AccountError:pass
   else:raise AssertionError('Old password accepted')
   assert accounts.login('newtester','new-password')['member']=='tester'
   assert cfg.label_for('tester')=='新名称'
   assert accounts.login('occupied','another-password')['member']=='occupied'
  print('PASS isolated account API authorization, display name, rename conflict, old password verification, password update, stable member/token and other account isolation')
asyncio.run(run())
