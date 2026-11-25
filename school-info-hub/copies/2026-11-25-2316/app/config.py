from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / 'config.yaml'

_cache = None


def get():
    global _cache
    if _cache is None:
        _cache = yaml.safe_load(CONFIG_PATH.read_text(encoding='utf-8')) or {}
    return _cache


def save(patch):
    cfg = get()
    for section, values in patch.items():
        if isinstance(values, dict):
            cfg.setdefault(section, {}).update(values)
        else:
            cfg[section] = values
    CONFIG_PATH.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding='utf-8')
    return cfg