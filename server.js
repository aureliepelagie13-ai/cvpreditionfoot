import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const STORE = path.join(__dirname, "data", "store.json");
const sessions = new Map();
const premiumSessions = new Map();

function readStore(){ return JSON.parse(fs.readFileSync(STORE,"utf8")); }
function writeStore(s){ fs.writeFileSync(STORE, JSON.stringify(s,null,2)); }
function adminAuth(req,res,next){
  const token=req.headers.authorization?.replace("Bearer ","");
  if(token && sessions.has(token)) return next();
  res.status(401).json({error:"Non autorisé"});
}
function premiumAuth(req){
  const token=req.headers.authorization?.replace("Bearer ","");
  const item=token && premiumSessions.get(token);
  if(!item) return false;
  if(item.expiresAt < Date.now()){ premiumSessions.delete(token); return false; }
  return true;
}
function safeUser(){ return process.env.ADMIN_USER || "admin"; }
function safePass(){ return process.env.ADMIN_PASSWORD || "PFci-500-2026!"; }
function baseUrl(req){ return (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/,""); }

app.use(express.json());
app.use(express.static(path.join(__dirname,"public")));

app.post("/api/login",(req,res)=>{
  const {username,password}=req.body;
  if(username===safeUser() && password===safePass()){
    const token=crypto.randomBytes(32).toString("hex");
    sessions.set(token,{created:Date.now()});
    return res.json({token});
  }
  res.status(401).json({error:"Identifiants incorrects"});
});

app.get("/api/predictions",(req,res)=>{
  const s=readStore();
  const published=s.predictions.filter(p=>p.published);
  if(!premiumAuth(req)) return res.json(published.map(p=>({id:p.id,match:p.match,league:p.league,date:p.date,time:p.time,locked:true})));
  res.json(published);
});

app.post("/api/predictions",adminAuth,(req,res)=>{
  const {match,league,date,time,pick,odds,analysis}=req.body;
  if(!match || !pick) return res.status(400).json({error:"Match et pronostic obligatoires"});
  const s=readStore();
  const item={id:crypto.randomUUID(),match,league:league||"",date:date||"",time:time||"",pick,odds:odds||"",analysis:analysis||"",published:true,createdAt:new Date().toISOString()};
  s.predictions.unshift(item); writeStore(s); res.json(item);
});

app.delete("/api/predictions/:id",adminAuth,(req,res)=>{
  const s=readStore();
  s.predictions=s.predictions.filter(p=>p.id!==req.params.id);
  writeStore(s); res.json({ok:true});
});

app.post("/api/create-payment",async(req,res)=>{
  const price=Number(process.env.PRICE_XOF||500);
  if(!process.env.WAVE_API_KEY) return res.status(503).json({error:"Wave n'est pas encore configuré.",setup:"Ajoutez WAVE_API_KEY côté serveur après avoir activé votre compte Wave Business."});
  const reference=`PF-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const successUrl=`${baseUrl(req)}/success.html?ref=${encodeURIComponent(reference)}`;
  const errorUrl=`${baseUrl(req)}/index.html?payment=error`;
  try{
    const response=await fetch("https://api.wave.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":`Bearer ${process.env.WAVE_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({amount:String(price),currency:"XOF",client_reference:reference,error_url:errorUrl,success_url:successUrl})});
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json(data);
    res.json({url:data.wave_launch_url,reference});
  }catch(e){res.status(500).json({error:"Erreur de connexion à Wave"});}
});

app.get("/api/verify-payment",async(req,res)=>{
  const reference=String(req.query.ref||"");
  const expected=Number(process.env.PRICE_XOF||500);
  if(!reference || !process.env.WAVE_API_KEY) return res.status(400).json({paid:false,error:"Référence ou configuration manquante"});
  try{
    const response=await fetch(`https://api.wave.com/v1/checkout/sessions/search?client_reference=${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${process.env.WAVE_API_KEY}`}});
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json({paid:false,error:"Impossible de vérifier le paiement"});
    const session=(data.result||[]).find(x=>x.client_reference===reference);
    const paid=Boolean(session && session.payment_status==="succeeded" && session.checkout_status==="complete" && Number(session.amount)===expected && session.currency==="XOF");
    if(!paid) return res.json({paid:false});
    const token=crypto.randomBytes(32).toString("hex");
    premiumSessions.set(token,{expiresAt:Date.now()+24*60*60*1000,reference});
    res.json({paid:true,token,expiresAt:Date.now()+24*60*60*1000});
  }catch(e){res.status(500).json({paid:false,error:"Erreur de vérification Wave"});}
});

app.get("/api/config",(req,res)=>res.json({siteName:process.env.SITE_NAME||"FootPredict CI",price:Number(process.env.PRICE_XOF||500)}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(PORT,()=>console.log(`FootPredict CI: http://localhost:${PORT}`));
