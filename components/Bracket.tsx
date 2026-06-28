"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { MATCHES, TEAMS } from "@/lib/data";
import { resolveAllStages } from "@/lib/bracket";
import { useStore, type LiveScore } from "@/lib/store";
import { formatIsraelDate, formatIsraelTime } from "@/lib/utils";
import type { MatchResult } from "@/lib/standings";

/* ================================================================
 * Flag images — convert emoji regional-indicators → ISO → flagcdn
 * ================================================================ */
const SPECIAL_FLAG: Record<string, string> = {
  ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir",
};

function flagUrl(code: string, emoji: string): string {
  if (SPECIAL_FLAG[code]) return `https://flagcdn.com/20x15/${SPECIAL_FLAG[code]}.png`;
  try {
    const chars = [...emoji];
    if (chars.length >= 2) {
      const cp = chars[0].codePointAt(0)!;
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
        const iso = chars.slice(0, 2)
          .map(c => String.fromCharCode(c.codePointAt(0)! - 0x1F1E6 + 65))
          .join("").toLowerCase();
        return `https://flagcdn.com/20x15/${iso}.png`;
      }
    }
  } catch {}
  return "";
}

function FlagImg({ code }: { code: string }) {
  const t = TEAMS[code];
  if (!t) return <span style={{ fontSize: 14, lineHeight: 1 }}>❓</span>;
  const url = flagUrl(code, t.flag ?? "");
  if (!url) return <span style={{ fontSize: 14, lineHeight: 1 }}>{t.flag}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      width={22} height={16}
      alt={code}
      style={{ flexShrink: 0, borderRadius: 2, objectFit: "cover",
               border: "1px solid rgba(255,255,255,0.2)" }}
    />
  );
}

/* ================================================================
 * Layout constants
 * ================================================================ */
const CW = 148;  // card width
const CH = 64;   // card height
const SH = 82;   // slot height
const CG = 24;   // column gap

const r32L = 0;
const r16L = r32L + CW + CG;
const qfL  = r16L + CW + CG;
const sfL  = qfL  + CW + CG;
const finX = sfL  + CW + CG;
const sfR  = finX + CW + CG;
const qfR  = sfR  + CW + CG;
const r16R = qfR  + CW + CG;
const r32R = r16R + CW + CG;

const TOTAL_W = r32R + CW;    // 9 × 172 = 1548
const TOTAL_H = SH * 8;       // 656
const LABEL_H = 36;
const CONT_H  = LABEL_H + TOTAL_H + 90;

const R32Y = Array.from({ length: 8 }, (_, i) => i * SH + SH / 2);
function avg(a: number, b: number) { return (a + b) / 2; }
const R16Y = [avg(R32Y[0],R32Y[1]),avg(R32Y[2],R32Y[3]),avg(R32Y[4],R32Y[5]),avg(R32Y[6],R32Y[7])];
const QFY  = [avg(R16Y[0],R16Y[1]), avg(R16Y[2],R16Y[3])];
const SFY  = avg(QFY[0], QFY[1]);
const FINY = SFY;

/* ================================================================
 * Match assignments
 * ================================================================ */
const LEFT_R32  = ["M075","M078","M073","M076","M083","M084","M082","M081"];
const LEFT_R16  = ["M089","M090","M091","M092"];
const LEFT_QF   = ["M097","M098"];
const LEFT_SF   = "M101";
const RIGHT_R32 = ["M074","M077","M079","M080","M087","M086","M085","M088"];
const RIGHT_R16 = ["M093","M094","M095","M096"];
const RIGHT_QF  = ["M099","M100"];
const RIGHT_SF  = "M102";
const FINAL_ID  = "M104";
const THIRD_ID  = "M103";

const ROUND_LABELS = [
  { label: "שלב 32",     cx: r32L + CW/2 },
  { label: "שמינית גמר", cx: r16L + CW/2 },
  { label: "רבע גמר",    cx: qfL  + CW/2 },
  { label: "חצי גמר",    cx: sfL  + CW/2 },
  { label: "גמר",        cx: finX + CW/2 },
  { label: "חצי גמר",    cx: sfR  + CW/2 },
  { label: "רבע גמר",    cx: qfR  + CW/2 },
  { label: "שמינית גמר", cx: r16R + CW/2 },
  { label: "שלב 32",     cx: r32R + CW/2 },
];

/* ================================================================
 * SVG connectors
 * ================================================================ */
function conn(x1:number,y1:number,mx:number,x2:number,y2:number){
  return `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`;
}
function buildConnectors(){
  const p:string[]=[];
  const mx01=r32L+CW+CG/2;
  for(let i=0;i<4;i++){const r=R16Y[i];p.push(conn(r32L+CW,R32Y[i*2],mx01,r16L,r));p.push(conn(r32L+CW,R32Y[i*2+1],mx01,r16L,r));}
  const mx12=r16L+CW+CG/2;
  for(let i=0;i<2;i++){const q=QFY[i];p.push(conn(r16L+CW,R16Y[i*2],mx12,qfL,q));p.push(conn(r16L+CW,R16Y[i*2+1],mx12,qfL,q));}
  const mx23=qfL+CW+CG/2;
  p.push(conn(qfL+CW,QFY[0],mx23,sfL,SFY));p.push(conn(qfL+CW,QFY[1],mx23,sfL,SFY));
  p.push(`M${sfL+CW} ${SFY} L${finX} ${FINY}`);
  const mx78=r32R-CG/2;
  for(let i=0;i<4;i++){const r=R16Y[i];p.push(conn(r32R,R32Y[i*2],mx78,r16R+CW,r));p.push(conn(r32R,R32Y[i*2+1],mx78,r16R+CW,r));}
  const mx67=r16R-CG/2;
  for(let i=0;i<2;i++){const q=QFY[i];p.push(conn(r16R,R16Y[i*2],mx67,qfR+CW,q));p.push(conn(r16R,R16Y[i*2+1],mx67,qfR+CW,q));}
  const mx56=qfR-CG/2;
  p.push(conn(qfR,QFY[0],mx56,sfR+CW,SFY));p.push(conn(qfR,QFY[1],mx56,sfR+CW,SFY));
  p.push(`M${sfR} ${SFY} L${finX+CW} ${FINY}`);
  return p;
}
const CONNECTORS=buildConnectors();

/* ================================================================
 * Helpers
 * ================================================================ */
const matchById = Object.fromEntries(MATCHES.map(m=>[m.id,m]));
function getDateStr(id:string){
  const m=matchById[id];if(!m?.utc)return"";
  try{return`${formatIsraelDate(m.utc,{short:true})} · ${formatIsraelTime(m.utc)}`;}
  catch{return"";}
}

/* Primary kit colours per team code — used for the left-border strip */
const KIT: Record<string,string> = {
  GER:"#000000",FRA:"#002395",BRA:"#009c3b",ARG:"#74acdf",
  ENG:"#cf081f",ESP:"#aa151b",POR:"#006600",NED:"#ff6600",
  BEL:"#ef2b2d",USA:"#002868",MEX:"#006847",COL:"#fcd116",
  CRO:"#ff0000",SUI:"#ff0000",AUT:"#ed2939",JPN:"#bc002d",
  AUS:"#00843d",IRN:"#239f40",MAR:"#c1272d",SEN:"#00853f",
  GHA:"#006b3f",CIV:"#f77f00",EGY:"#ce1126",NOR:"#ef2b2d",
  SWE:"#006aa7",RSA:"#007a4d",CAN:"#ff0000",ECU:"#ffd100",
  PAR:"#d52b1e",COD:"#007fff",BIH:"#002395",CPV:"#003893",
  SRB:"#c6363c",CMR:"#007a5e",URU:"#5eb6e4",KOR:"#cd2e3a",
  CHN:"#de2910",SAU:"#006c35",MOR:"#c1272d",ALG:"#006233",
  TUN:"#e70013",NGR:"#008751",HAI:"#00209f",
  CUW:"#002b7f",SVN:"#003da5",SVK:"#0b4ea2",CZE:"#d7141a",
  HUN:"#477050",ROU:"#002b7f",UKR:"#005bbb",TUR:"#e30a17",
  GRE:"#0d5eaf",SCO:"#003380",WAL:"#00a650",NIR:"#cf081f",
};

/* ================================================================
 * Team row
 * ================================================================ */
function TeamRow({code,score,isWinner,tbd}:{
  code:string;score:number|null;isWinner:boolean;tbd:boolean;
}){
  const t=TEAMS[code]??null;
  const kit=KIT[code]??"#334155";
  return(
    <div style={{
      display:"flex",alignItems:"center",gap:5,
      padding:"3px 4px",
      borderRadius:3,
      background:isWinner?"rgba(59,130,246,0.1)":"transparent",
      opacity:tbd?0.5:1,
      borderLeft:`3px solid ${tbd?"#c8d0df":kit}`,
    }}>
      {tbd
        ? <span style={{fontSize:12,lineHeight:1,flexShrink:0,color:"#8a96ad"}}>?</span>
        : <FlagImg code={code}/>
      }
      <span style={{
        flex:1,fontSize:12,fontWeight:isWinner?800:600,
        overflow:"hidden",textOverflow:"ellipsis",
        whiteSpace:"nowrap" as const,lineHeight:1.2,
        color:isWinner?"#1e3a8a":tbd?"#8a96ad":"#1e2840",
        fontStyle:tbd?"italic" as const:"normal" as const,
      }}>
        {tbd?"?":t?.name??code}
      </span>
      {score!==null&&(
        <span style={{
          fontSize:14,fontWeight:800,minWidth:20,
          textAlign:"right" as const,
          color:isWinner?"#1e3a8a":"#2d3a55",
        }}>{score}</span>
      )}
    </div>
  );
}

/* ================================================================
 * Match card
 * ================================================================ */
function MatchCard({id,resolved,results,liveScores,x,cy,isFinal}:{
  id:string;
  resolved:Record<string,{home:string;away:string;winner:string;loser:string}>;
  results:Record<string,MatchResult>;
  liveScores:Record<string,LiveScore>;
  x:number;cy:number;isFinal?:boolean;
}){
  const r=resolved[id];const base=matchById[id];
  const homeCode=r?.home||base?.home||"";
  const awayCode=r?.away||base?.away||"";
  const homeTbd=!TEAMS[homeCode];const awayTbd=!TEAMS[awayCode];
  const res=results[id];const live=liveScores[id];
  const homeScore=res?.home??(live!=null?live.home:null);
  const awayScore=res?.away??(live!=null?live.away:null);
  const hasScore=homeScore!==null&&awayScore!==null;
  const homeWins=hasScore&&homeScore>awayScore;
  const awayWins=hasScore&&awayScore>homeScore;
  const winner=r?.winner||(res?.winner as string|undefined)||"";
  const isLive=!!live?.minuteLabel&&!/HT|FT|AET|AP/i.test(live.minuteLabel??"");
  const isDone=!!res;
  const dateStr=getDateStr(id);
  const cardH=isFinal?CH+6:CH;
  const cardW=isFinal?CW+6:CW;

  return(
    <div style={{
      position:"absolute" as const,
      left:isFinal?x-3:x, top:LABEL_H+cy-cardH/2,
      width:cardW,height:cardH,
      background:isFinal
        ?"rgba(255,243,205,0.8)"
        :isDone?"#ffffff":"rgba(255,255,255,0.6)",
      border:`${isFinal?2:1}px solid ${
        isLive?"#22c55e"
        :isFinal?"#d4a017"
        :isDone?"#b8c2d4":"#c8d0df"
      }`,
      borderRadius:8,
      padding:"5px 7px",
      boxSizing:"border-box" as const,
      display:"flex",flexDirection:"column" as const,gap:2,
      boxShadow:isLive?"0 0 10px rgba(34,197,94,0.4)"
        :isFinal?"0 2px 12px rgba(212,160,23,0.3)":"0 1px 4px rgba(30,40,80,0.1)",
    }}>
      {isLive&&(
        <div style={{
          position:"absolute" as const,top:-11,left:"50%",
          transform:"translateX(-50%)",
          fontSize:9,fontWeight:800,color:"#22c55e",
          background:"#052e16",padding:"1px 6px",borderRadius:4,
          whiteSpace:"nowrap" as const,border:"1px solid rgba(34,197,94,0.3)",
        }}>🔴 {live?.minuteLabel}</div>
      )}
      <TeamRow code={homeCode} score={homeScore}
        isWinner={winner?winner===homeCode:homeWins} tbd={homeTbd}/>
      <div style={{height:1,background:"#e2e8f4",margin:"0 -3px"}}/>
      <TeamRow code={awayCode} score={awayScore}
        isWinner={winner?winner===awayCode:awayWins} tbd={awayTbd}/>
      {dateStr&&(
        <div style={{
          fontSize:9,color:"#6b7a9a",
          textAlign:"center" as const,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap" as const,marginTop:1,
        }}>{dateStr}</div>
      )}
    </div>
  );
}

/* ================================================================
 * Main
 * ================================================================ */
export default function Bracket(){
  const matchResults=useStore(s=>s.matchResults);
  const liveScores  =useStore(s=>s.liveScores);
  const resolved=useMemo(()=>resolveAllStages(matchResults),[matchResults]);

  const outerRef=useRef<HTMLDivElement>(null);
  const [scale,setScale]=useState(1);

  useEffect(()=>{
    const update=()=>{
      if(!outerRef.current)return;
      const w=outerRef.current.clientWidth-8;
      setScale(Math.min(1, w/TOTAL_W));
    };
    update();
    let obs:ResizeObserver|null=null;
    if(typeof ResizeObserver!=="undefined"&&outerRef.current){
      obs=new ResizeObserver(update);obs.observe(outerRef.current);
    }
    return()=>obs?.disconnect();
  },[]);

  const mc=(id:string,x:number,cy:number,isFinal=false)=>(
    <MatchCard key={id} id={id} resolved={resolved} results={matchResults}
      liveScores={liveScores} x={x} cy={cy} isFinal={isFinal}/>
  );

  const scaledH=Math.round(CONT_H*scale)+4;

  return(
    <div ref={outerRef} style={{width:"100%",padding:"4px",boxSizing:"border-box" as const}}>
      <div style={{
        position:"relative",width:"100%",height:scaledH,
        overflow:"hidden",borderRadius:14,
        background:"linear-gradient(160deg,#dde3ee 0%,#e8ecf5 60%,#dce2ed 100%)",
      }}>

        {/* Bracket canvas */}
        <div style={{
          position:"absolute",left:0,top:0,
          width:TOTAL_W,height:CONT_H,
          transform:`scale(${scale})`,transformOrigin:"top left",
        }}>
          {/* Round labels */}
          {ROUND_LABELS.map(({label,cx},i)=>(
            <div key={i} style={{
              position:"absolute" as const,top:7,left:cx-66,width:132,
              textAlign:"center" as const,fontSize:11,fontWeight:800,
              textTransform:"uppercase" as const,letterSpacing:"0.07em",
              color:"#3d5080",whiteSpace:"nowrap" as const,
            }}>{label}</div>
          ))}
          <div style={{position:"absolute",top:LABEL_H-5,left:0,right:0,
            height:1,background:"rgba(30,40,80,0.1)"}}/>

          {/* SVG connectors */}
          <svg style={{position:"absolute",top:LABEL_H,left:0,overflow:"visible",pointerEvents:"none"}}
            width={TOTAL_W} height={TOTAL_H}>
            {CONNECTORS.map((d,i)=>(
              <path key={i} d={d} stroke="rgba(100,120,170,0.5)" strokeWidth={1.5} fill="none"/>
            ))}
          </svg>

          {/* Cards */}
          {LEFT_R32.map( (id,i)=>mc(id,r32L,R32Y[i]))}
          {LEFT_R16.map( (id,i)=>mc(id,r16L,R16Y[i]))}
          {LEFT_QF.map(  (id,i)=>mc(id,qfL, QFY[i]))}
          {mc(LEFT_SF,  sfL,  SFY)}
          {mc(FINAL_ID, finX, FINY, true)}
          {mc(RIGHT_SF, sfR,  SFY)}
          {RIGHT_QF.map( (id,i)=>mc(id,qfR, QFY[i]))}
          {RIGHT_R16.map((id,i)=>mc(id,r16R,R16Y[i]))}
          {RIGHT_R32.map((id,i)=>mc(id,r32R,R32Y[i]))}

          {/* Trophy */}
          <div style={{
            position:"absolute" as const,
            left:finX+CW/2-15,top:LABEL_H+FINY+CH/2+10,
            fontSize:28,lineHeight:1,textAlign:"center" as const,
            filter:"drop-shadow(0 0 10px rgba(251,191,36,0.7))",
          }}>🏆</div>

          {/* 3rd place */}
          <div style={{
            position:"absolute" as const,
            left:finX,top:LABEL_H+FINY+CH/2+50,
            width:CW,textAlign:"center" as const,
            fontSize:9,fontWeight:700,textTransform:"uppercase" as const,
            letterSpacing:"0.05em",color:"#6b7a9a",
          }}>מקום שלישי</div>
          {mc(THIRD_ID,finX,FINY+CH+80)}
        </div>
      </div>
    </div>
  );
}
