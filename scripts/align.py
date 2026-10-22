"""Optional acoustic verification, not subtitle interpolation or voice synthesis."""
import sys, os, json, re
from difflib import SequenceMatcher
from faster_whisper import WhisperModel

def norm(s):
    return ''.join(re.findall(r'\w', s, re.UNICODE)).lower()

if len(sys.argv) != 4:
    raise SystemExit('Usage: align.py audio.wav "expected short phrase" output.json')
audio, expected, target = sys.argv[1:]
if os.path.exists(target):
    raise SystemExit('Output exists; choose a new file')
model = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8', local_files_only=True)
segments, info = model.transcribe(audio, language='zh', word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
words = [{'text':w.word, 'start':w.start, 'end':w.end, 'probability':w.probability} for s in segments for w in (s.words or [])]
recognized = ''.join(w['text'] for w in words)
score = SequenceMatcher(None, norm(expected), norm(recognized)).ratio()
result = {'expected':expected,'recognized':recognized,'similarity':score,'duration':info.duration,'words':words,'passed':score >= 0.85,'timing':'faster-whisper-acoustic-word-timestamps','notes':'Recognition timestamps are acoustic estimates; no forced equal spacing or automatic subtitle replacement'}
with open(target,'x',encoding='utf-8') as f:
    json.dump(result,f,ensure_ascii=False,indent=2)
if not result['passed']:
    raise SystemExit('Low transcript match; inspect speech before proceeding')
