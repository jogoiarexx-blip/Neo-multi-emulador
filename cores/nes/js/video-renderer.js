export class WebGLPresenter{
 constructor(canvas){this.canvas=canvas;this.gl=null;this.ok=false;this.texture=null;this.program=null;this.vao=null;this.uniforms={};this.init()}
 init(){try{
  const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!gl)return;
  const vs=`#version 300 es
in vec2 aPos;in vec2 aUv;out vec2 vUv;void main(){vUv=aUv;gl_Position=vec4(aPos,0.0,1.0);}`;
  const fs=`#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uUvMin;uniform vec2 uUvMax;uniform vec2 uSourceSize;uniform vec2 uOutputSize;
uniform int uMode;
uniform float uScanline;uniform float uMask;uniform float uGlow;uniform float uCurvature;uniform float uVignette;
uniform float uBrightness;uniform float uContrast;uniform float uSaturation;uniform float uGamma;uniform float uSharpness;
in vec2 vUv;out vec4 outColor;

vec2 curved(vec2 uv){vec2 p=uv*2.0-1.0;float r2=dot(p,p);p*=1.0+uCurvature*r2;return p*0.5+0.5;}
vec2 remap(vec2 uv){return mix(uUvMin,uUvMax,uv);}
vec3 texel(vec2 px){return texture(uTex,(px+0.5)/uSourceSize).rgb;}

// Legacy compatibility marker: mix(uUvMin,uUvMax,vUv)
// Pixel-aware sharp bilinear: keeps flat pixels crisp while smoothing only boundaries.
vec3 sampleSharp(vec2 uv);
vec3 sharpBilinear(vec2 uv){
 vec2 p=uv*uSourceSize-0.5;vec2 ip=floor(p);vec2 f=fract(p);
 vec2 scale=max(uOutputSize/uSourceSize,vec2(1.0));
 vec2 region=clamp((f-0.5)*scale+0.5,0.0,1.0);
 region=region*region*(3.0-2.0*region);
 vec2 suv=(ip+region+0.5)/uSourceSize;
 vec3 lin=texture(uTex,suv).rgb;
 vec3 nearc=texture(uTex,(ip+vec2(step(0.5,f.x),step(0.5,f.y))+0.5)/uSourceSize).rgb;
 return mix(lin,nearc,clamp(uSharpness,0.0,1.0)*0.35);
}
vec3 sampleSharp(vec2 uv){return sharpBilinear(uv);}

vec3 compositeNtsc(vec2 uv){
 vec2 dx=vec2(1.0/uSourceSize.x,0.0);
 vec3 c0=texture(uTex,uv).rgb,cL=texture(uTex,uv-dx).rgb,cR=texture(uTex,uv+dx).rgb;
 float y0=dot(c0,vec3(.299,.587,.114));
 float yL=dot(cL,vec3(.299,.587,.114));float yR=dot(cR,vec3(.299,.587,.114));
 vec3 chroma=c0-vec3(y0);
 vec3 bleed=((cL-vec3(yL))+(cR-vec3(yR)))*0.5;
 float phase=sin((gl_FragCoord.x+gl_FragCoord.y*0.5)*3.14159265*0.5);
 vec3 col=vec3(y0*0.82+(yL+yR)*0.09)+mix(chroma,bleed,0.46);
 col+=vec3(phase*0.006,-phase*0.003,phase*0.004);
 return col;
}

vec3 colorCorrect(vec3 c){
 c*=uBrightness;
 c=(c-0.5)*uContrast+0.5;
 float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,uSaturation);
 c=max(c,vec3(0.0));
 c=pow(c,vec3(1.0/max(0.1,uGamma)));
 return c;
}

void main(){
 vec2 local=vUv;
 if(uCurvature>0.0001){local=curved(vUv);if(any(lessThan(local,vec2(0.0)))||any(greaterThan(local,vec2(1.0)))){outColor=vec4(0,0,0,1);return;}}
 vec2 uv=remap(local);
 vec3 col;
 if(uMode==2||uMode==3||uMode==4)col=sharpBilinear(uv);
 else if(uMode==5)col=compositeNtsc(uv);
 else col=texture(uTex,uv).rgb;

 if(uMode==3||uMode==4){
  float srcY=uv.y*uSourceSize.y;
  float beam=0.5+0.5*cos(6.2831853*fract(srcY));
  float strength=mix(1.0,0.62,beam*uScanline);
  col*=strength;
  float mx=mod(gl_FragCoord.x,3.0);
  vec3 mask=mx<1.0?vec3(1.0,0.83,0.83):(mx<2.0?vec3(0.83,1.0,0.83):vec3(0.83,0.83,1.0));
  col*=mix(vec3(1.0),mask,uMask);
  if(uGlow>0.001){vec2 dx=vec2(1.0/uSourceSize.x,0.0),dy=vec2(0.0,1.0/uSourceSize.y);vec3 halo=(texture(uTex,uv-dx).rgb+texture(uTex,uv+dx).rgb+texture(uTex,uv-dy).rgb+texture(uTex,uv+dy).rgb)*0.25;col+=halo*uGlow*0.09;}
 }
 if(uMode==6){
  float gx=mod(gl_FragCoord.x,3.0);vec3 sub=gx<1.0?vec3(1.02,.95,.95):(gx<2.0?vec3(.95,1.02,.95):vec3(.95,.95,1.02));
  float grid=(mod(gl_FragCoord.y,2.0)<1.0)?0.975:1.0;col*=sub*grid;
 }
 if(uVignette>0.001){vec2 q=vUv*(1.0-vUv);float vig=pow(clamp(q.x*q.y*16.0,0.0,1.0),0.20);col*=mix(1.0,vig,uVignette);}
 col=colorCorrect(col);
 outColor=vec4(clamp(col,0.0,1.0),1.0);
}`;
  const sh=(type,src)=>{const x=gl.createShader(type);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x)||'shader');return x};
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr)||'link');
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);const data=new Float32Array([-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0]);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const ap=gl.getAttribLocation(pr,'aPos'),au=gl.getAttribLocation(pr,'aUv');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(au);gl.vertexAttribPointer(au,2,gl.FLOAT,false,16,8);
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  this.gl=gl;this.program=pr;this.texture=tex;this.vao=vao;for(const n of ['uUvMin','uUvMax','uSourceSize','uOutputSize','uMode','uScanline','uMask','uGlow','uCurvature','uVignette','uBrightness','uContrast','uSaturation','uGamma','uSharpness'])this.uniforms[n]=gl.getUniformLocation(pr,n);this.ok=true
 }catch(e){console.warn('WebGL2 indisponível',e);this.ok=false}}
 setSize(w,h){if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;if(this.gl)this.gl.viewport(0,0,w,h)}
 present(source,smooth=false,crop=null){if(!this.ok)return false;const opts=(smooth&&typeof smooth==='object')?smooth:{smooth:!!smooth,crop};const gl=this.gl,{smooth:sm=false,crop:cr=null,mode=0,scanline=0,mask=0,glow=0,curvature=0,vignette=0,brightness=1,contrast=1,saturation=1,gamma=1,sharpness=.65}=opts;gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);const f=sm?gl.LINEAR:gl.NEAREST;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);const c=cr||{left:0,right:0,top:0,bottom:0};const l=Math.max(0,Math.min(255,c.left||0))/256,r=Math.max(0,Math.min(255,c.right||0))/256,t=Math.max(0,Math.min(239,c.top||0))/240,b=Math.max(0,Math.min(239,c.bottom||0))/240;
  gl.uniform2f(this.uniforms.uUvMin,l,t);gl.uniform2f(this.uniforms.uUvMax,1-r,1-b);gl.uniform2f(this.uniforms.uSourceSize,256,240);gl.uniform2f(this.uniforms.uOutputSize,this.canvas.width,this.canvas.height);gl.uniform1i(this.uniforms.uMode,mode|0);gl.uniform1f(this.uniforms.uScanline,scanline);gl.uniform1f(this.uniforms.uMask,mask);gl.uniform1f(this.uniforms.uGlow,glow);gl.uniform1f(this.uniforms.uCurvature,curvature);gl.uniform1f(this.uniforms.uVignette,vignette);gl.uniform1f(this.uniforms.uBrightness,brightness);gl.uniform1f(this.uniforms.uContrast,contrast);gl.uniform1f(this.uniforms.uSaturation,saturation);gl.uniform1f(this.uniforms.uGamma,gamma);gl.uniform1f(this.uniforms.uSharpness,sharpness);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true}
}
