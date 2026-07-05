"""
AeroSAGE Oracle — AI Remediation & Diagnostic Agent.
Rule-based expert system acting as a Senior Aerodynamicist.
Generates structured diagnostics and fix recommendations.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import math

from app.api.auth import get_current_user

router = APIRouter()


class OracleRequest(BaseModel):
    analytics: Dict[str, Any]
    stall: Dict[str, Any]
    shock: Dict[str, Any]
    separation_zones: List[Dict[str, Any]]
    defects: List[Dict[str, Any]]
    alpha: float
    mach: float
    reynolds: float


class DiagnosticItem(BaseModel):
    severity: str       # INFO | ADVISORY | CAUTION | WARNING
    code: str
    title: str
    description: str
    recommendation: str
    affected_metric: str


SEVERITY_PRIORITY = {"WARNING": 0, "CAUTION": 1, "ADVISORY": 2, "INFO": 3}

DEFECT_PROFILES = {
    "RIME_ICE": {
        "name": "Rime Ice Accretion",
        "effect": "Increases surface roughness and modifies LE geometry, degrading Cl_max and increasing Cd.",
        "fix": "Increase de-icing boot cycle frequency. Consider electro-thermal anti-icing for critical phases."
    },
    "HORN_ICE": {
        "name": "Glaze/Horn Ice Formation",
        "effect": "Creates severe LE discontinuity causing massive flow separation and premature stall.",
        "fix": "IMMEDIATE de-icing required. Reduce AoA margin by 4°. Consider diversion if wing contamination persists."
    },
    "DENT": {
        "name": "Structural Surface Dent",
        "effect": "Creates local pressure disturbance and potential transition trip.",
        "fix": "Schedule MRO inspection. If depth > 0.5mm at x/c < 0.15, requires sheet metal repair per SRM."
    },
    "STEP": {
        "name": "Panel Step / Mismatch",
        "effect": "Trips boundary layer to turbulent, increasing skin friction drag.",
        "fix": "Re-align panel edges during next C-check. Apply flush-fill compound for interim dispatch."
    },
    "ROUGHNESS": {
        "name": "Surface Roughness Contamination",
        "effect": "Global increase in skin friction coefficient and turbulent boundary layer thickening.",
        "fix": "Clean airfoil surfaces. Inspect paint condition. Apply erosion-resistant coating."
    },
}


class DiagnosticEngine:
    def run(self, req: OracleRequest) -> List[DiagnosticItem]:
        items: List[DiagnosticItem] = []
        a = req.analytics

        # ── Defect-specific diagnostics ──
        for i, defect in enumerate(req.defects):
            dtype = defect.get("type", "UNKNOWN")
            profile = DEFECT_PROFILES.get(dtype, {})
            sev = defect.get("severity", 0)
            loc = defect.get("x_loc", 0)

            if abs(sev) > 0.05:
                severity = "WARNING" if abs(sev) > 0.08 else "CAUTION" if abs(sev) > 0.03 else "ADVISORY"
            else:
                severity = "INFO"

            if loc < 0.15 and dtype in ("HORN_ICE", "RIME_ICE"):
                severity = "WARNING"

            items.append(DiagnosticItem(
                severity=severity,
                code=f"DEF-{i+1:03d}",
                title=f"{profile.get('name', dtype)} at x/c = {loc:.2f}",
                description=f"{profile.get('effect', 'Unknown effect.')} Severity: {sev:.4f}.",
                recommendation=profile.get("fix", "Consult maintenance manual."),
                affected_metric="CL / CD"
            ))

        # ── Lift degradation ──
        dcl = a.get("delta_cl", 0)
        if abs(dcl) > 0.02:
            pct = abs(dcl) / max(abs(a.get("cl_baseline", 1)), 0.01) * 100
            sev = "WARNING" if pct > 15 else "CAUTION" if pct > 5 else "ADVISORY"
            items.append(DiagnosticItem(
                severity=sev, code="PERF-CL",
                title=f"Lift Degradation: ΔCL = {dcl:+.4f} ({pct:.1f}%)",
                description=f"Effective CL reduced from {a.get('cl_baseline',0):.4f} to {a.get('cl',0):.4f}.",
                recommendation="Increase AoA to compensate, observing stall margin. Consider speed increase.",
                affected_metric="CL"
            ))

        # ── Drag increase ──
        dcd = a.get("delta_cd", 0)
        if dcd > 0.0005:
            pct = dcd / max(a.get("cd_baseline", 0.01), 1e-5) * 100
            sev = "WARNING" if pct > 30 else "CAUTION" if pct > 10 else "ADVISORY"
            items.append(DiagnosticItem(
                severity=sev, code="PERF-CD",
                title=f"Drag Increase: ΔCD = {dcd:+.5f} ({pct:.1f}%)",
                description=f"Drag coefficient rose from {a.get('cd_baseline',0):.5f} to {a.get('cd_total',0):.5f}.",
                recommendation="Expect increased fuel burn. Re-plan cruise altitude/speed for fuel efficiency.",
                affected_metric="CD"
            ))

        # ── L/D efficiency ──
        ld = a.get("ld", 0)
        if ld > 0:
            delta_ld = a.get("delta_ld", 0)
            if abs(delta_ld) > 2:
                items.append(DiagnosticItem(
                    severity="CAUTION", code="PERF-LD",
                    title=f"Efficiency Loss: ΔL/D = {delta_ld:+.1f}",
                    description=f"Aerodynamic efficiency reduced to L/D = {ld:.1f}.",
                    recommendation="Reduced range/endurance. Update flight planning fuel reserves.",
                    affected_metric="L/D"
                ))

        # ── Stall ──
        stall = req.stall
        if stall.get("detected"):
            items.append(DiagnosticItem(
                severity="WARNING", code="STALL-DET",
                title=f"{stall.get('type','UNKNOWN')} STALL — Severity {stall.get('severity',0)*100:.0f}%",
                description=f"Flow separation detected at x/c = {stall.get('separation_onset_x',0):.3f}. "
                            f"Margin: {stall.get('margin_deg',0):.1f}° AoA remaining.",
                recommendation="REDUCE AoA IMMEDIATELY. Increase airspeed. Deploy slats/flaps if available.",
                affected_metric="CL_max"
            ))
        elif stall.get("severity", 0) > 0.3:
            items.append(DiagnosticItem(
                severity="CAUTION", code="STALL-PROX",
                title=f"Stall Proximity: {stall.get('severity',0)*100:.0f}% threshold",
                description=f"Approaching stall conditions. Margin: {stall.get('margin_deg',0):.1f}°.",
                recommendation="Monitor AoA. Avoid abrupt maneuvers. Consider increasing speed.",
                affected_metric="CL_max"
            ))

        # ── LSB ──
        lsb = stall.get("laminar_bubble")
        if lsb:
            items.append(DiagnosticItem(
                severity="ADVISORY", code="LSB-DET",
                title=f"Laminar Separation Bubble: x/c = {lsb['start']:.3f} → {lsb['end']:.3f}",
                description=f"{lsb.get('type','SHORT')} bubble with Cp plateau at {lsb.get('cp_plateau',0):.3f}.",
                recommendation="Consider turbulator tape at x/c = {:.2f} to force transition upstream.".format(
                    max(0, lsb['start'] - 0.02)),
                affected_metric="Transition"
            ))

        # ── Shock ──
        shock = req.shock
        if shock.get("detected"):
            items.append(DiagnosticItem(
                severity="WARNING", code="SHOCK-SBLI",
                title=f"Transonic Shock Detected — Peak M = {shock.get('peak_mach',0):.3f}",
                description=f"Supersonic region x/c = {shock.get('shock_start_x',0):.2f} → {shock.get('shock_end_x',0):.2f}. "
                            f"Wave drag increment: ΔCd = {shock.get('wave_drag',0):.5f}.",
                recommendation="Reduce Mach number below critical. Consider supercritical wing profile redesign.",
                affected_metric="CD_wave"
            ))

        # ── Sort by severity ──
        items.sort(key=lambda x: SEVERITY_PRIORITY.get(x.severity, 9))
        return items


@router.post("/diagnose")
async def oracle_diagnose(req: OracleRequest, user=Depends(get_current_user)):
    engine = DiagnosticEngine()
    diagnostics = engine.run(req)
    return {
        "diagnostics": [d.model_dump() for d in diagnostics],
        "summary": {
            "total_items": len(diagnostics),
            "warnings": sum(1 for d in diagnostics if d.severity == "WARNING"),
            "cautions": sum(1 for d in diagnostics if d.severity == "CAUTION"),
            "advisories": sum(1 for d in diagnostics if d.severity == "ADVISORY"),
            "airworthy": all(d.severity != "WARNING" for d in diagnostics),
        }
    }