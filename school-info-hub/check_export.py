import ast
from pathlib import Path
from types import SimpleNamespace
from fastapi.responses import Response, JSONResponse

source = Path('school-info-hub/app/main.py').read_text(encoding='utf-8')
tree = ast.parse(source)
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'study_notes')
fn.decorator_list = []
history = [{'role':'user','content':'用户问题不应导出'}, {'role':'assistant','content':"导数：f'(2) = 4。"}]
scope = {'db':SimpleNamespace(chat_history=lambda *a,**k:history), 'Response':Response, 'JSONResponse':JSONResponse}
exec(compile(ast.Module(body=[fn], type_ignores=[]), '<export-test>', 'exec'), scope)
r = scope['study_notes'](7)
assert r.status_code == 200
assert r.body.startswith(b'\xef\xbb\xbf')
assert "导数：f'(2) = 4。" in r.body.decode('utf-8-sig')
assert '用户问题不应导出' not in r.body.decode('utf-8-sig')
history.clear()
assert scope['study_notes'](7).status_code == 404
print('PASS: UTF-8 BOM, Chinese/formula roundtrip, assistant-only export, empty history 404')
