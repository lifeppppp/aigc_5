"""Run from school-info-hub: python scripts/check_study_model.py [--live]."""
import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from fastapi import HTTPException
from app import starwood_api as model


def local_checks():
    source = '老师：提交报告，日期待通知。'
    item = {'title': '提交报告', 'date': '', 'details': '日期待通知', 'evidence': source}
    assert model.parse_items(json.dumps({'items': [item, item]}), source)[0]['date'] == ''
    assert len(model.parse_items(json.dumps({'items': [item, item]}), source)) == 1
    invalid = {**item, 'date': '2026-02-30'}
    assert model.parse_items(json.dumps({'items': [invalid]}), source)[0]['date'] == ''
    for malformed in ['[]', '{"items":{}}', '{"items":[null]}',
                      json.dumps({'items': [{**item, 'evidence': '不存在'}]}),
                      json.dumps({'items': [{**item, 'title': 123}]}),
                      json.dumps({'items': [{**item, 'date': []}]})]:
        try:
            model.parse_items(malformed, source)
        except HTTPException as error:
            assert error.status_code == 502
        else:
            raise AssertionError('Malformed model output accepted')
    assert '2026-11-27' in model.extraction_prompt(date(2026, 11, 27))
    print('PASS local evidence, invalid dates, schema and duplicate checks')


class TextRequest:
    def __init__(self, text):
        self.text = text

    async def stream(self):
        yield self.text.encode('utf8')


async def live_checks():
    cases = json.loads((ROOT / 'tests/study_model_cases.json').read_text(encoding='utf8'))
    for case in cases:
        response = await model.extract(TextRequest(case['text']), filename='sample.txt')
        items = response['items']
        assert len(items) == case['count'], (case['id'], response)
        if 'date' in case:
            assert all(x['date'] == case['date'] for x in items), (case['id'], response)
        if 'contains' in case:
            assert any(case['contains'] in x['title'] + x['details'] for x in items)
        assert all(x['evidence'] in case['text'] for x in items)
        print('PASS live', case['id'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='Uses configured Bailian and incurs API usage')
    args = parser.parse_args()
    local_checks()
    if args.live:
        asyncio.run(live_checks())
