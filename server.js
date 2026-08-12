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

function readStore(){ return JSON.parse(fs.readFileSync(STORE,"utf8")); }
function writeStore(s){ fs.writeFileSync(STORE, JSON.stringify(s,null,2)); }
function auth(req,res,next){
  const token=req.headers.authorization?.replace("Bearer ","");
  if(token && sessions.has(token)) return next();
  res.status(401).json({error:"Non autorisé"});
}
function safeUser(){ return process.env.ADMIN_USER || "admin"; }
function safePass(){ return process.env.ADMIN_PASSWORD || "change-me"; }

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
  res.json(s.predictions.filter(p=>p.published));
});

app.post("/api/predictions",auth,(req,res)=>{
  const {match,league,date,time,pick,odds,analysis}=req.body;
  if(!match || !pick) return res.status(400).json({error:"Match et pronostic obligatoires"});
  const s=readStore();
  const item={id:crypto.randomUUID(),match,league:league||"",date:date||"",time:time||"",pick,odds:odds||"",analysis:analysis||"",published:true,createdAt:new Date().toISOString()};
  s.predictions.unshift(item); writeStore(s); res.json(item);
});

app.delete("/api/predictions/:id",auth,(req,res)=>{
  const s=readStore();
  s.predictions=s.predictions.filter(p=>p.id!==req.params.id);
  writeStore(s); res.json({ok:true});
});

/*
  Wave integration:
  1) Create a Wave Business account.
  2) Put your API key in WAVE_API_KEY on the server only.
  3) Create a Checkout Session for 500 XOF and redirect the customer to checkout_session.wave_launch_url.
  The exact production endpoint and webhook flow are documented by Wave.
*/
app.post("/api/create-payment",async(req,res)=>{
  const price=Number(process.env.PRICE_XOF||500);
  if(!process.env.WAVE_API_KEY){
    return res.status(503).json({
      error:"Wave n'est pas encore configuré.",
      setup:"Ajoutez WAVE_API_KEY dans .env après avoir activé votre compte Wave Business."
    });
  }
  try{
    const response=await fetch("https://api.wave.com/v1/checkout/sessions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.WAVE_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        amount:String(price),currency:"XOF",
        error_url:process.env.WAVE_ERROR_URL,
        success_url:process.env.WAVE_SUCCESS_URL
      })
    });
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json(data);
    res.json({url:data.wave_launch_url||data.checkout_url||data.url,session:data});
  }catch(e){res.status(500).json({error:"Erreur de connexion à Wave"});}
});

app.get("/api/config",(req,res)=>res.json({
  siteName:process.env.SITE_NAME||"FootPredict CI",
  price:Number(process.env.PRICE_XOF||500)
}));

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(PORT,()=>console.log(`FootPredict CI: http://localhost:${PORT}`));
