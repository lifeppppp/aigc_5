"""Synthetic-site tests; never opens a real third-party account."""
import asyncio
import ast
import importlib.util
import json
import sys
import tempfile
import types
import shutil
from pathlib import Path
from urllib.parse import urlparse
from cryptography.fernet import Fernet
from pydantic import BaseModel
from fastapi import FastAPI, Depends
from playwright.sync_api import sync_playwright

ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]/"sentinel"
with tempfile.TemporaryDirectory() as tmp:
 cfg=types.ModuleType('config');cfg.RUN=Path(tmp)/'run';cfg.AUTH=Path(tmp)/'auth';cfg.OWNER='tester';cfg.VIEWPORT=(1000,800);cfg.CHROME=shutil.which('google-chrome') or '/usr/bin/google-chrome';cfg.MEMBERS=Path(tmp)/'members.json'
 keys={member:Fernet.generate_key().decode() for member in ['tester','other']}
 cfg.secret_for=lambda member:keys[member]
 cfg.ensure_dirs=lambda:(cfg.RUN.mkdir(exist_ok=True),cfg.AUTH.mkdir(exist_ok=True))
 cfg.ensure_dirs();sys.modules['config']=cfg
 def load(name):
  spec=importlib.util.spec_from_file_location(name,ROOT/(name+'.py'))
  mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod;spec.loader.exec_module(mod);return mod
 vault=load('vault');browser=load('browser')
 assert not browser.login_complete({'url':'https://passport2.chaoxing.com/login','login_form':False,'text_len':2000},'https://i.chaoxing.com')
 assert not browser.login_complete({'url':'https://i.chaoxing.com/home','login_form':True,'text_len':2000},'https://i.chaoxing.com')
 assert browser.login_complete({'url':'https://i.chaoxing.com/home','login_form':False,'text_len':100},'https://i.chaoxing.com')
 credentials={'username':'synthetic-student','password':'synthetic-password-123'}
 with sync_playwright() as pw:
  chrome=pw.chromium.launch(executable_path=cfg.CHROME,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  try:
   ctx=chrome.new_context()
   remembered=browser._remember_login(ctx,'chaoxing','tester')
   ctx.route('**/*',lambda route:route.fulfill(content_type='text/html',body='<form><input id="username" autocomplete="username"><input type="password"></form>'))
   page=ctx.new_page();page.goto('https://passport2.chaoxing.com/login')
   page.locator('#username').fill(credentials['username']);page.locator('input[type=password]').fill(credentials['password'])
   page.wait_for_timeout(100)
   assert remembered==credentials
   browser._encrypted_json('chaoxing-credentials','tester',remembered)
   assert browser._read_credentials('chaoxing','tester')==credentials
   assert credentials['password'].encode() not in vault.path_for('chaoxing-credentials','tester').read_bytes()
   assert not list(cfg.RUN.glob('connect-*.json'))
   assert browser._read_credentials('chaoxing','other')=={}
   ctx.close()
   ctx=chrome.new_context();browser._remember_login(ctx,'chaoxing','tester')
   ctx.route('**/*',lambda route:route.fulfill(content_type='text/html',body='<form><input id="username" autocomplete="username"><input type="password"></form>'))
   page=ctx.new_page();page.goto('https://passport2.chaoxing.com/login')
   page.wait_for_function("document.querySelector('input[type=password]').value.length>0")
   assert page.locator('#username').input_value()==credentials['username']
   assert page.locator('input[type=password]').input_value()==credentials['password']
   page.goto('https://example.org/login')
   assert page.locator('input[type=password]').input_value()==''
   ctx.close()
  finally:chrome.close()
 # Run actual refresh function with isolated config, status and scheduler stubs.
 cfg.read_sites=lambda:[{'name':'chaoxing','label':'学习通','needs_auth':True,'enabled':True}]
 status={'state':'ready','key':'chaoxing--tester'}
 calls=[]
 class RunIn:
  def __init__(self,**kwargs):self.__dict__.update(kwargs)
 scope=dict(app=FastAPI(),BaseModel=BaseModel,Depends=Depends,verify=lambda:'tester',config=cfg,vault=vault,time=__import__('time'),_own_sites=lambda sites,member:sites,_grant_state=lambda site,member:status,run_now=lambda body,member:calls.append(member),RunIn=RunIn)
 src=(ROOT/'api.py').read_text(encoding='utf-8-sig')
 exec(src[src.index('class ConnectRefreshIn'):],scope)
 endpoint=scope['connect_refresh'];body=scope['ConnectRefreshIn']
 result=endpoint(body(force=True),member='tester')
 assert result['pending'] and not calls
 assert (cfg.RUN/'grant-done-chaoxing--tester').exists()
 browser._encrypted_json('chaoxing','tester',{'cookies':[]})
 status.update(state='saved')
 result=endpoint(body(force=False),member='tester')
 assert result['scan_started'] and calls==['tester']
 assert not endpoint(body(force=False),member='tester')['scan_started']
 assert calls==['tester']
print('PASS protected-login checks, real browser credential capture/autofill, encrypted per-member storage, origin restrictions, refresh confirmation and scan deduplication')
