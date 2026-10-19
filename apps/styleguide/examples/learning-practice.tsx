'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Button,RadioGroup,RadioItem,Progress,DirectionProvider} from '@mobtranslate/ui';
import questions from '../public/fixtures/interface-lesson.json';
type Attempt={round:number;question:string;choice:number;correct:boolean};
const action:CSSProperties={minHeight:44,height:'auto',minWidth:0,maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere'};
export function LearningPracticeExample(){
  const [index,setIndex]=useState(0),[round,setRound]=useState(1),[choice,setChoice]=useState(''),[checked,setChecked]=useState('');
  const [attempts,setAttempts]=useState<Attempt[]>([]),[feedback,setFeedback]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false),[rtl,setRtl]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null),group=useRef<HTMLDivElement>(null),arrival=useRef<HTMLParagraphElement>(null);
  const moved=useRef(false);
  const question=questions[index];
  const latest=attempts.filter(attempt=>attempt.round===round&&attempt.question===question.id).at(-1);
  const count=questions.filter(item=>attempts.filter(attempt=>attempt.round===round&&attempt.question===item.id).at(-1)?.correct).length;
  useEffect(()=>{if(moved.current){if(complete)arrival.current?.focus();else heading.current?.focus();}},[index,round,complete]);
  function check(){const value=Number(choice);if(!choice||!Number.isInteger(value)||value<0||value>=question.options.length){setError('Choose one answer before checking.');group.current?.querySelector<HTMLElement>('[role=radio]')?.focus();return;}setError('');const correct=value===question.answerIndex;setAttempts(previous=>[...previous,{round,question:question.id,choice:value,correct}]);setChecked(choice);setFeedback(correct?'The checked answer is correct for this authored interface exercise.':'The checked answer needs another try. Read the explanation and source, then choose again.');}
  function next(){if(!latest?.correct||checked!==choice)return;moved.current=true;if(index===questions.length-1)setComplete(true);else{setIndex(value=>value+1);setChoice('');setChecked('');setFeedback('');setError('');}}
  return <DirectionProvider direction={rtl?'rtl':'ltr'}><div data-learning-lab lang="en" dir={rtl?'rtl':'ltr'} className="space-y-4" style={{overflowWrap:'anywhere'}}>
    <p dir="auto">Three authored English interface-concept questions. This is not a language translation, pronunciation assessment, qualified review or learning credential. Progress is page-memory practice only.</p>
    <Button style={action} type="button" variant="outline" aria-pressed={rtl} onClick={()=>setRtl(value=>!value)}>Use RTL learning layout</Button>
    <Progress value={count} max={questions.length} aria-label="Current round checked interface questions" getAriaValueText={(_,value)=>`${value} of ${questions.length} current-round questions correct`} />
    <p dir="auto" data-learning-count>Round {round}: {count} of {questions.length} latest checked answers correct. {attempts.length} {attempts.length===1?'attempt':'attempts'} retained across rounds.</p>
    {!complete&&<div className="space-y-3"><h3 id="learning-question" ref={heading} tabIndex={-1} className="font-semibold" dir="auto">Question {index+1} of {questions.length}: {question.prompt}</h3>
      <RadioGroup ref={group} name="lesson-answer" aria-labelledby="learning-question" aria-describedby={error?'learning-answer-error':undefined} value={choice} onValueChange={value=>{if(typeof value==='string')setChoice(value);}}>{question.options.map((option,number)=><RadioItem key={option} value={String(number)} label={option} />)}</RadioGroup>
      {error&&<p id="learning-answer-error" role="alert" dir="auto">{error}</p>}
      <div className="flex flex-wrap gap-3"><Button style={action} type="button" onClick={check}>Check interface answer</Button><Button style={action} type="button" variant="outline" disabled={!latest?.correct||checked!==choice} onClick={next}>{index===questions.length-1?'Complete local exercise':'Next interface question'}</Button></div>
      {feedback&&<div><p role="status" dir="auto" data-learning-feedback>{feedback}{checked!==choice?' Current draft choice differs from the checked answer; check again before advancing.':''}</p><p dir="auto">{question.explanation}</p><a className="underline" href={question.sourceHref}>{question.sourceTitle}</a></div>}
    </div>}
    <p ref={arrival} tabIndex={-1} role="status" dir="auto" data-learning-completion>{complete?'Local interface exercise complete: all three latest checked answers in this round were correct. Nothing was submitted to a learning service.':'Practice is in progress; no completed exercise outcome yet.'}</p>
    <Button style={action} type="button" variant="outline" onClick={()=>{moved.current=true;setRound(value=>value+1);setIndex(0);setChoice('');setChecked('');setFeedback('');setError('');setComplete(false);}}>Start a new practice round</Button>
    <ol className="guidance-list" data-learning-history>{attempts.map((attempt,number)=><li key={number} dir="auto">Round {attempt.round}, {attempt.question}: option {attempt.choice+1}, {attempt.correct?'correct':'needs another try'}.</li>)}</ol>
  </div></DirectionProvider>;
}
