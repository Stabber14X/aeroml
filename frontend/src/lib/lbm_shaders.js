// lbm_shaders.js — High-fidelity LBM WebGPU Shaders

export const COMPUTE_SHADER = `
struct Uniforms {
    width     : f32,
    height    : f32,
    time      : f32,
    viscosity : f32,
    u0        : f32,
    mouse_x   : f32,
    mouse_y   : f32,
    mode      : f32,
};

@group(0) @binding(0) var<uniform> params   : Uniforms;
@group(0) @binding(1) var<storage, read>       f_in    : array<f32>;
@group(0) @binding(2) var<storage, read_write> f_out   : array<f32>;
@group(0) @binding(3) var<storage, read>       barrier : array<u32>;

const W9: array<f32, 9> = array<f32, 9>(
    4.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0,
    1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0
);
const CX: array<f32, 9> = array<f32, 9>(0.0,  1.0, 0.0,-1.0, 0.0,  1.0,-1.0,-1.0, 1.0);
const CY: array<f32, 9> = array<f32, 9>(0.0,  0.0, 1.0, 0.0,-1.0,  1.0, 1.0,-1.0,-1.0);
const OPP: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

fn idx9(x: u32, y: u32) -> u32 {
    return (y * u32(params.width) + x) * 9u;
}

fn feq(wi: f32, rho: f32, ux: f32, uy: f32, cxi: f32, cyi: f32) -> f32 {
    let cu  = cxi * ux + cyi * uy;
    let u2  = ux*ux + uy*uy;
    return wi * rho * (1.0 + 3.0*cu + 4.5*cu*cu - 1.5*u2);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    let W = u32(params.width);
    let H = u32(params.height);
    if (x >= W || y >= H) { return; }

    let tau   = 3.0 * params.viscosity + 0.5;
    let omega = 1.0 / tau;

    // ------- STREAM step (pull) -------
    for (var i = 0u; i < 9u; i++) {
        let sx = i32(x) - i32(CX[i]);
        let sy = i32(y) - i32(CY[i]);

        var is_wall = false;
        if (sy < 0 || sy >= i32(H)) {
            is_wall = true;
        } else if (sx >= 0 && sx < i32(W)) {
            if (barrier[u32(sy) * W + u32(sx)] == 1u) { is_wall = true; }
        }

        if (is_wall) {
            // Bounce-back
            f_out[idx9(x,y) + i] = f_in[idx9(x,y) + OPP[i]];
        } else if (sx < 0) {
            // Inlet: equilibrium at u0
            let cu  = CX[i] * params.u0;
            let feq_in = W9[i] * 1.0 * (1.0 + 3.0*cu + 4.5*cu*cu - 1.5*params.u0*params.u0);
            f_out[idx9(x,y) + i] = feq_in;
        } else if (sx >= i32(W)) {
            // Outlet: zero-gradient copy
            f_out[idx9(x,y) + i] = f_in[idx9(x-1u, y) + i];
        } else {
            // Collide at source cell then stream
            let s_base = idx9(u32(sx), u32(sy));
            var s_rho = 0.0; var s_ux = 0.0; var s_uy = 0.0;
            for (var k=0u; k<9u; k++) {
                let v = f_in[s_base + k];
                s_rho += v;
                s_ux  += v * CX[k];
                s_uy  += v * CY[k];
            }
            if (s_rho > 1e-6) { s_ux /= s_rho; s_uy /= s_rho; }
            // clamp velocity for stability
            let spd = sqrt(s_ux*s_ux + s_uy*s_uy);
            if (spd > 0.3) { let sc = 0.3/spd; s_ux *= sc; s_uy *= sc; }

            let f_src = f_in[s_base + i];
            let f_eq  = feq(W9[i], s_rho, s_ux, s_uy, CX[i], CY[i]);
            f_out[idx9(x,y) + i] = f_src + omega * (f_eq - f_src);
        }
    }

    // Inlet column: hard reset every step
    if (x == 0u) {
        let base = idx9(0u, y);
        for (var i=0u; i<9u; i++) {
            let cu  = CX[i] * params.u0;
            f_out[base + i] = W9[i] * 1.0 * (1.0 + 3.0*cu + 4.5*cu*cu - 1.5*params.u0*params.u0);
        }
    }
}
`;

export const RENDER_SHADER = `
struct Uniforms {
    width     : f32,
    height    : f32,
    time      : f32,
    viscosity : f32,
    u0        : f32,
    mouse_x   : f32,
    mouse_y   : f32,
    mode      : f32,
};

@group(0) @binding(0) var<uniform> params   : Uniforms;
@group(0) @binding(1) var<storage, read>   f_data  : array<f32>;
@group(0) @binding(2) var<storage, read>   barrier : array<u32>;

struct VO { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex
fn vert_main(@builtin(vertex_index) vi: u32) -> VO {
    var p = array<vec2<f32>,6>(
        vec2(-1.0,-1.0),vec2(1.0,-1.0),vec2(-1.0,1.0),
        vec2(-1.0,1.0), vec2(1.0,-1.0),vec2(1.0,1.0)
    );
    var o: VO;
    o.pos = vec4(p[vi],0.0,1.0);
    o.uv  = vec2(p[vi].x*0.5+0.5, 1.0-(p[vi].y*0.5+0.5));
    return o;
}

fn macros(x:u32,y:u32) -> vec3<f32> {
    let CX = array<f32,9>(0.0,1.0,0.0,-1.0,0.0,1.0,-1.0,-1.0,1.0);
    let CY = array<f32,9>(0.0,0.0,1.0,0.0,-1.0,1.0,1.0,-1.0,-1.0);
    var rho=0.0; var ux=0.0; var uy=0.0;
    let base = (y*u32(params.width)+x)*9u;
    for(var i=0u;i<9u;i++){
        let f=f_data[base+i]; rho+=f; ux+=f*CX[i]; uy+=f*CY[i];
    }
    if(rho>1e-6){ux/=rho;uy/=rho;}
    return vec3(rho,ux,uy);
}

// ---- Colourmaps ----
fn magma(t:f32)->vec3<f32>{
    let t2=clamp(t,0.0,1.0);
    return vec3(
        t2*t2*(3.0-2.0*t2)*0.9 + 0.05,
        smoothstep(0.15,0.85,t2)*0.75,
        smoothstep(0.55,1.0,t2)*0.9 + 0.05
    );
}
fn schlieren_col(t:f32)->vec3<f32>{
    let v=clamp(t,0.0,1.0);
    return vec3(v*0.92, v*0.96, v+0.04*(1.0-v));
}
fn vorticity_col(c:f32)->vec4<f32>{
    let v=clamp(abs(c),0.0,1.0);
    if(c>0.0){ return vec4(v*0.95,v*0.2,v*0.1,1.0); }
    else      { return vec4(v*0.1,v*0.35,v,1.0); }
}
fn pressure_col(t:f32)->vec3<f32>{
    // blue(low) -> white(mid) -> red(high)
    let v=clamp(t,0.0,1.0);
    let r=smoothstep(0.4,0.9,v);
    let g=1.0-abs(v-0.5)*2.0;
    let b=smoothstep(0.6,0.1,v);
    return vec3(r,g*0.6,b);
}

@fragment
fn frag_main(@location(0) uv:vec2<f32>) -> @location(0) vec4<f32> {
    let W=u32(params.width); let H=u32(params.height);
    let x=u32(uv.x*params.width);
    let y=u32(uv.y*params.height);
    if(x>=W||y>=H){discard;}

    if(barrier[y*W+x]==1u){ return vec4(0.0,0.0,0.0,0.0); }

    let c  = macros(x,y);
    let rx = min(x+1u,W-1u); let lx=select(x-1u,0u,x==0u);
    let dy = min(y+1u,H-1u); let uy2=select(y-1u,0u,y==0u);

    // MODE 0: Speed / Velocity magnitude
    if(params.mode < 0.5){
        let spd=sqrt(max(0.0,c.y*c.y+c.z*c.z));
        let t=clamp(spd/params.u0*0.85,0.0,1.0);
        return vec4(magma(t),1.0);
    }
    // MODE 1: Schlieren (density gradient)
    if(params.mode < 1.5){
        let r2=macros(rx,y); let u2=macros(x,uy2);
        let gx=r2.x-c.x; let gy=u2.x-c.x;
        let t=clamp(sqrt(gx*gx+gy*gy)*130.0,0.0,1.0);
        return vec4(schlieren_col(t),1.0);
    }
    // MODE 2: Vorticity
    if(params.mode < 2.5){
        let r2=macros(rx,y); let l2=macros(lx,y);
        let d2=macros(x,dy); let u2=macros(x,uy2);
        let curl=(r2.z-l2.z)*0.5-(d2.y-u2.y)*0.5;
        return vorticity_col(curl*45.0);
    }
    // MODE 3: Pressure (rho)
    let t=clamp((c.x-0.9)/0.2,0.0,1.0);
    return vec4(pressure_col(t),1.0);
}
`;

// Particle/streamline compute — advects N tracers each frame
export const PARTICLE_SHADER = `
struct Uniforms {
    width:f32, height:f32, time:f32, viscosity:f32,
    u0:f32, mouse_x:f32, mouse_y:f32, mode:f32,
};
struct Particle { x:f32, y:f32, age:f32, _pad:f32 };

@group(0) @binding(0) var<uniform>            params    : Uniforms;
@group(0) @binding(1) var<storage,read>        f_data    : array<f32>;
@group(0) @binding(2) var<storage,read_write>  particles : array<Particle>;

const CX9:array<f32,9>=array<f32,9>(0.0,1.0,0.0,-1.0,0.0,1.0,-1.0,-1.0,1.0);
const CY9:array<f32,9>=array<f32,9>(0.0,0.0,1.0,0.0,-1.0,1.0,1.0,-1.0,-1.0);

fn sample_vel(xf:f32,yf:f32)->vec2<f32>{
    let W=u32(params.width); let H=u32(params.height);
    let xi=clamp(u32(xf),0u,W-1u);
    let yi=clamp(u32(yf),0u,H-1u);
    let base=(yi*W+xi)*9u;
    var ux=0.0; var uy=0.0; var rho=0.0;
    for(var i=0u;i<9u;i++){
        let f=f_data[base+i]; rho+=f; ux+=f*CX9[i]; uy+=f*CY9[i];
    }
    if(rho>1e-6){ux/=rho;uy/=rho;}
    return vec2(ux,uy);
}

fn hash(n:u32)->f32{ var v=n*2654435761u; v=(v^(v>>16u))*2246822519u; return f32(v)/4294967296.0; }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>){
    let idx=gid.x;
    if(idx>=arrayLength(&particles)){return;}
    var p=particles[idx];

    let W=params.width; let H=params.height;
    let dt=1.8;
    let v=sample_vel(p.x,p.y);
    p.x+=v.x*dt;
    p.y+=v.y*dt;
    p.age+=1.0;

    let maxAge=120.0+hash(idx*7u)*80.0;
    let dead = p.x<0.0||p.x>=W||p.y<0.0||p.y>=H||p.age>maxAge;
    if(dead){
        // Respawn along left edge, spread vertically
        p.x = 1.0 + hash(idx+u32(p.age)*31u)*4.0;
        p.y = hash(idx*13u+u32(p.age))*H;
        p.age=0.0;
    }
    particles[idx]=p;
}
`;