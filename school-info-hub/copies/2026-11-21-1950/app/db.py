import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
(DATA / 'documents').mkdir(exist_ok=True)
DB = DATA / 'app.db'


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init():
    with conn() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT DEFAULT 'dingtalk',
            group_name TEXT NOT NULL,
            sender TEXT DEFAULT '',
            content TEXT NOT NULL,
            ts REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversations(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conv_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            ts REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            used_model INTEGER DEFAULT 0,
            created_at REAL NOT NULL
        );
        ''')


def add_message(group_name, sender, content, source='dingtalk', ts=None):
    with conn() as c:
        cur = c.execute(
            'INSERT INTO messages(source,group_name,sender,content,ts) VALUES(?,?,?,?,?)',
            (source, group_name, sender, content, ts or time.time()))
        return cur.lastrowid


def list_messages(group=None, limit=200, since=None):
    q = 'SELECT * FROM messages'
    cond, args = [], []
    if group:
        cond.append('group_name=?'); args.append(group)
    if since:
        cond.append('ts>=?'); args.append(since)
    if cond:
        q += ' WHERE ' + ' AND '.join(cond)
    q += ' ORDER BY ts DESC LIMIT ?'
    args.append(limit)
    with conn() as c:
        return [dict(r) for r in c.execute(q, args)]


def list_groups():
    with conn() as c:
        return [r[0] for r in c.execute('SELECT DISTINCT group_name FROM messages ORDER BY group_name')]


def new_conversation(title):
    with conn() as c:
        cur = c.execute('INSERT INTO conversations(title,created_at) VALUES(?,?)', (title, time.time()))
        return cur.lastrowid


def add_chat_message(conv_id, role, content):
    with conn() as c:
        c.execute('INSERT INTO chat_messages(conv_id,role,content,ts) VALUES(?,?,?,?)',
                  (conv_id, role, content, time.time()))


def chat_history(conv_id, limit=20):
    with conn() as c:
        rows = [dict(r) for r in c.execute(
            'SELECT role,content FROM chat_messages WHERE conv_id=? ORDER BY id DESC LIMIT ?', (conv_id, limit))]
    return list(reversed(rows))


def list_conversations():
    with conn() as c:
        return [dict(r) for r in c.execute('SELECT * FROM conversations ORDER BY id DESC LIMIT 100')]


def add_document(title, used_model):
    with conn() as c:
        cur = c.execute('INSERT INTO documents(title,used_model,created_at) VALUES(?,?,?)',
                        (title, int(used_model), time.time()))
        return cur.lastrowid


def list_documents():
    with conn() as c:
        return [dict(r) for r in c.execute('SELECT * FROM documents ORDER BY id DESC LIMIT 100')]


def get_document(doc_id):
    with conn() as c:
        r = c.execute('SELECT * FROM documents WHERE id=?', (doc_id,)).fetchone()
        return dict(r) if r else None