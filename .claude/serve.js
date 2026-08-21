const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)){res.writeHead(403).end('no');return;}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404,{'Content-Type':'text/plain'}).end('404');return;}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'}).end(d);
  });
}).listen(8412,()=>console.log('listening on http://localhost:8412'));
