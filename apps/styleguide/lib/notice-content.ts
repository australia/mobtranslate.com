export interface NoticeMeasures {codeUnits:number;codePoints:number;graphemes:number|null}
export function measureNoticeText(text:string):NoticeMeasures {
  let graphemes:number|null=null;
  if(typeof Intl.Segmenter==='function') {
    try{graphemes=Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)).length;}catch{graphemes=null;}
  }
  return {codeUnits:text.length,codePoints:Array.from(text).length,graphemes};
}
export type NoticePriority='routine'|'time-sensitive';
export type NoticePlacement='history-only'|'queued'|'live-region';
export interface NoticeRecord {id:number;title:string;body:string;priority:NoticePriority;createdAt:string;placement:NoticePlacement;opened:boolean}
export interface NoticePreferences {enabled:boolean;defer:boolean;urgentMayInterrupt:boolean;redact:boolean}
export function choosePlacement(priority:NoticePriority,preferences:NoticePreferences):NoticePlacement {
  if(!preferences.enabled)return 'history-only';
  if(preferences.defer&&!(priority==='time-sensitive'&&preferences.urgentMayInterrupt))return 'queued';
  return 'live-region';
}
export function noticePreview(record:NoticeRecord,redact:boolean) {
  return redact?{title:'New local notice',body:'Open the local record for its full details.'}:{title:record.title,body:record.body};
}
