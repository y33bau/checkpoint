function drawCity(canvas){
 const g=canvas.getContext('2d'),w=1100,h=330;canvas.width=w;canvas.height=h;
 let seed=61;const rand=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
 const sky=g.createLinearGradient(0,0,0,h);[[0,'#514175'],[.4,'#d36992'],[.72,'#ffad88'],[1,'#693955']].forEach(([p,c])=>sky.addColorStop(p,c));g.fillStyle=sky;g.fillRect(0,0,w,h);
 const haze=g.createRadialGradient(790,122,12,790,122,280);
 haze.addColorStop(0,'#ffc28f75');haze.addColorStop(1,'#ffc28f00');
 g.fillStyle=haze;g.fillRect(480,0,620,320);
 for(let i=0;i<90;i++){
   const x=rand()*w,y=rand()*110;
   g.fillStyle=i%10===0?'#fff0c6ab':'#f7d2f16b';g.fillRect(x,y,i%10===0?2:1,1);
 }
 g.save();g.beginPath();g.arc(805,126,77,0,7);g.clip();g.fillStyle='#ffd19a';g.fillRect(720,45,165,88);for(let y=135;y<206;y+=9){g.fillRect(720,y,170,5)}g.restore();
 for(let layer=0;layer<2;layer++){let x=0;while(x<w){let bw=10+rand()*50,bh=10+rand()*(layer?64:48),y=229-bh+layer*18;g.fillStyle=layer?'#46304e':'#845074';g.fillRect(x,y,bw,250-y);if(rand()>.6){g.fillRect(x+3,y-5,bw*.7,7)}for(let a=x+5;a<x+bw-3;a+=8)for(let b=y+6;b<242;b+=10){if(rand()>.68){g.fillStyle='#e79a91';g.fillRect(a,b,3,2)}}x+=bw+2}}
 const sea=g.createLinearGradient(0,248,0,h);
 sea.addColorStop(0,'#68435b');sea.addColorStop(1,'#193440');
 g.fillStyle=sea;g.fillRect(0,248,w,82);
 for(let i=0;i<52;i++){
   const y=251+rand()*70,x=605+rand()*380;
   g.fillStyle=i%3?'#e7859950':'#7ce9d070';g.fillRect(x,y,2+rand()*39,1);
 }for(let i=0;i<300;i++){g.fillStyle=i%3?'#756079':'#cf8984';g.fillRect(rand()*w,250+rand()*80,rand()*32,1)}
 function palm(x,y,s,tilt){g.save();g.translate(x,y);g.scale(s,s);g.rotate(tilt);g.fillStyle='#211e35';g.beginPath();g.moveTo(-6,0);g.quadraticCurveTo(16,-102,3,-183);g.lineTo(7,-182);g.quadraticCurveTo(26,-100,8,0);g.fill();g.translate(5,-181);for(let d of [-1,1])for(let j=0;j<5;j++){let l=47+10*j,dy=-57+j*15;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(d*l*.57,dy-25,d*l,dy+30);for(let k=9;k>=1;k--){let t=k/10;let py=2*(1-t)*t*(dy-25)+t*t*(dy+30);g.lineTo(d*l*t,py+4+(1-t)*8);g.lineTo(d*l*(t-.04),py-1)}g.fill()}g.restore()}
 palm(945,276,1.3,-.12);palm(1054,277,.85,.1);palm(602,261,.55,.12);palm(366,272,.67,-.15);g.fillStyle='#211e35';g.beginPath();g.moveTo(0,330);g.lineTo(w,267);g.lineTo(w,330);g.fill();
}
