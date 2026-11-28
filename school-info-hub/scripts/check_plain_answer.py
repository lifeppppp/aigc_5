import ast,re
from pathlib import Path
source=(Path(__file__).resolve().parents[1]/'app/starwood_api.py').read_text(encoding='utf8')
node=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='plain_answer')
scope={'re':re}
exec(compile(ast.Module(body=[node],type_ignores=[]),'<formatter>','exec'),scope)
f=scope['plain_answer']
cases=[
 ('# 概念\n## **定义**','概念\n定义'),
 ('###标题\n**重点**','标题\n重点'),
 ('C#、F#、#include、x*y、2 ** 3、__init__','C#、F#、#include、x*y、2 ** 3、__init__'),
 ('```python\n# 注释\nx = 2 ** 3\n```','# 注释\nx = 2 ** 3'),
 ('`# 注释` 和 `a ** b`','# 注释 和 a ** b'),
 ('---\n1. 求导\nκ = 1/R','1. 求导\nκ = 1/R')]
for before,after in cases:assert f(before)==after,(before,f(before),after)
print('PASS 6 format preservation cases')
