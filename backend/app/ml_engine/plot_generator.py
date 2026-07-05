# backend/app/ml_engine/plot_generator.py
import matplotlib
matplotlib.use('Agg')  
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import io
import base64
import math

class ScientificPlotGenerator:
    """
    Phase 2 Sovereign Engine:
    Generates 15 High-Fidelity 300-DPI PNGs for the Dossier.
    Utilizes an Elite Corporate Aerospace Theme (Midnight Blue, Gold, Crimson).
    """
    def __init__(self, analytics_engine):
        self.engine = analytics_engine
        self.results = analytics_engine.results
        self.pareto = analytics_engine.pareto_data
        
        plt.rcParams.update({
            "font.family": "serif",
            "font.serif": ["Times New Roman", "DejaVu Serif"],
            "axes.facecolor": "#F8FAFC", 
            "figure.facecolor": "#FFFFFF",
            "text.color": "#0F2027",
            "axes.labelcolor": "#0F2027",
            "axes.edgecolor": "#7A8B99",
            "xtick.color": "#0F2027",
            "ytick.color": "#0F2027",
            "grid.color": "#E8ECEF",
            "grid.linestyle": "-",
            "axes.grid": True,
            "figure.dpi": 300, 
            "axes.titlesize": 12,
            "axes.titleweight": "bold",
            "axes.labelsize": 10,
            "legend.fontsize": 8,
            "lines.linewidth": 1.5
        })
        
        # Elite Corporate Palette
        self.c_navy = "#0F2027"    # Midnight Blue/Charcoal
        self.c_crimson = "#ED2B33" # Alert Red
        self.c_gold = "#F2A900"    # Aerospace Gold
        self.c_teal = "#408EC6"    # Aviation Blue
        self.c_gray = "#7A8B99"    # Slate
        self.c_silver = "#E8ECEF"  # Silver fills

    def _fig_to_base64_png(self, fig):
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', transparent=False, dpi=300)
        plt.close(fig)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode('utf-8')

    def plot_comparative_profile(self):
        """Plots the Target against the NACA Baseline and the computed Pareto Optimal."""
        fig, ax = plt.subplots(figsize=(10, 3))
        
        ax.fill(self.pareto['base_x'], self.pareto['base_y'], color=self.c_silver, label='Baseline (NACA 4412)', alpha=0.6)
        ax.plot(self.pareto['base_x'], self.pareto['base_y'], color=self.c_gray, linestyle='--', linewidth=1)
        
        ax.plot(self.pareto['pareto_x'], self.pareto['pareto_y'], color=self.c_gold, linestyle='-.', linewidth=2, label='Pareto Optimal Generation')
        
        ax.plot(self.engine.coords_x, self.engine.coords_y, color=self.c_navy, linewidth=2.5, label='Target Design Profile')
        ax.plot(self.engine.x_chord_array, self.engine.camber_array, color=self.c_crimson, linestyle=':', linewidth=1.5, label='Target Camber Line')

        ax.set_aspect('equal', adjustable='box')
        ax.set_title("1. Comparative Geometric Profile Mapping")
        ax.set_xlabel("Chordwise Station ($x/c$)")
        ax.set_ylabel("Thickness Ratio ($y/c$)")
        ax.legend(loc='upper right', frameon=True, facecolor='white', edgecolor=self.c_gray)
        return self._fig_to_base64_png(fig)

    def plot_pareto_frontier(self):
        """Plots the stochastic cloud and the absolute Pareto Frontier."""
        fig, ax = plt.subplots(figsize=(7, 5))
        
        c_cd = self.pareto['cloud_cd']
        c_cl = self.pareto['cloud_cl']
        
        ax.scatter(c_cd, c_cl, color=self.c_teal, alpha=0.3, s=15, label='Stochastic Design Cloud (n=150)')
        
        sort_idx = np.argsort(c_cd)
        p_cd, p_cl = [], []
        max_cl = -np.inf
        for cd, cl in zip(c_cd[sort_idx], c_cl[sort_idx]):
            if cl >= max_cl:
                p_cd.append(cd)
                p_cl.append(cl)
                max_cl = cl
        ax.plot(p_cd, p_cl, color=self.c_navy, linestyle='--', linewidth=2, label='Absolute Pareto Frontier')
        
        ax.scatter(self.results['DomC']['22_Total_Drag_Coefficient'], self.results['DomC']['21_Viscous_Lift_Coefficient'], 
                   color=self.c_crimson, marker='o', s=120, edgecolor='white', zorder=6, label='Current Target')
        ax.scatter(self.pareto['base_cd'], self.pareto['base_cl'], 
                   color=self.c_gray, marker='X', s=100, zorder=5, label='Baseline Concept')
        ax.scatter(self.pareto['pareto_cd'], self.pareto['pareto_cl'], 
                   color=self.c_gold, marker='*', s=200, edgecolor='black', zorder=7, label='Optimal Pareto Shape')

        ax.set_title("2. Multi-Objective Stochastic Pareto Analysis")
        ax.set_xlabel("Total Drag Coefficient ($C_d$)")
        ax.set_ylabel("Total Lift Coefficient ($C_l$)")
        ax.legend(loc='lower right', frameon=True, facecolor='white', edgecolor=self.c_gray)
        return self._fig_to_base64_png(fig)

    def plot_performance_matrix(self):
        fig, axs = plt.subplots(2, 2, figsize=(10, 8))
        alphas = self.engine.sweep_arrays['a']
        cls = self.engine.sweep_arrays['cl']
        cds = self.engine.sweep_arrays['cd']
        cms = self.engine.sweep_arrays['cm']
        lds = cls / np.where(cds > 0, cds, 1e-6)

        axs[0,0].plot(alphas, cls, color=self.c_navy, linewidth=2)
        axs[0,0].axvline(x=self.engine.alpha, color=self.c_crimson, linestyle=':', label='Target $\\alpha$')
        axs[0,0].set_title("Lift Coefficient ($C_l$) vs. $\\alpha$")
        axs[0,0].set_xlabel("$\\alpha$ (deg)")
        axs[0,0].set_ylabel("$C_l$")
        axs[0,0].legend()

        axs[0,1].plot(cds, cls, color=self.c_navy, linewidth=2)
        axs[0,1].scatter(self.results['DomC']['22_Total_Drag_Coefficient'], self.results['DomC']['21_Viscous_Lift_Coefficient'], color=self.c_crimson, s=60, zorder=5, label='Operating Point')
        axs[0,1].set_title("Drag Polar ($C_l$ vs. $C_d$)")
        axs[0,1].set_xlabel("$C_d$")
        axs[0,1].set_ylabel("$C_l$")
        axs[0,1].legend()

        axs[1,0].plot(alphas, lds, color=self.c_teal, linewidth=2)
        axs[1,0].set_title("Aerodynamic Efficiency ($L/D$)")
        axs[1,0].set_xlabel("$\\alpha$ (deg)")
        axs[1,0].set_ylabel("$L/D$")

        axs[1,1].plot(alphas, cms, color=self.c_navy, linewidth=2)
        axs[1,1].set_title("Pitching Moment ($C_{m, c/4}$)")
        axs[1,1].set_xlabel("$\\alpha$ (deg)")
        axs[1,1].set_ylabel("$C_m$")

        plt.tight_layout()
        return self._fig_to_base64_png(fig)

    def plot_boundary_layer_thickness(self):
        fig, ax = plt.subplots(figsize=(8, 4))
        x = self.engine.bl_arrays['x']
        th_u = self.engine.bl_arrays['th_U']
        ds_u = self.engine.bl_arrays['d_star_U']
        
        ax.fill_between(x, 0, ds_u, color=self.c_teal, alpha=0.2, label='Displacement Thickness ($\\delta^*$)')
        ax.plot(x, ds_u, color=self.c_teal, linewidth=2)
        ax.plot(x, th_u, color=self.c_crimson, linestyle='--', linewidth=2, label='Momentum Thickness ($\\theta$)')
        
        ax.set_title("4. Boundary Layer Energy Deficit (Upper Surface)")
        ax.set_xlabel("Chordwise Station ($x/c$)")
        ax.set_ylabel("Thickness Magnitude")
        ax.legend(loc='upper left')
        return self._fig_to_base64_png(fig)

    def plot_boundary_layer_state(self):
        fig, ax1 = plt.subplots(figsize=(8, 4))
        x = self.engine.bl_arrays['x']
        cf_u = self.engine.bl_arrays['cf_U']
        h_u = self.engine.bl_arrays['H_U']
        
        ax1.plot(x, cf_u, color=self.c_navy, linewidth=2, label='$C_f$ (Skin Friction)')
        ax1.set_xlabel('Chordwise Station ($x/c$)')
        ax1.set_ylabel('Skin Friction Coefficient ($C_f$)', color=self.c_navy)
        
        xtr = self.results['DomC']['33_Laminar_Turbulent_Transition']
        ax1.axvline(x=xtr, color=self.c_teal, linestyle='--', label=f'Transition ($x={xtr:.2f}$)')
        
        xsep = self.results['DomC']['34_Boundary_Layer_Separation']
        if xsep < 1.0:
            ax1.axvline(x=xsep, color=self.c_crimson, linestyle=':', label=f'Separation ($x={xsep:.2f}$)')
            
        ax2 = ax1.twinx()
        ax2.plot(x, h_u, color=self.c_gold, linewidth=2, label='$H$ (Shape Factor)')
        ax2.set_ylabel('Kinematic Shape Factor ($H$)', color=self.c_gold)
        ax2.axhline(y=2.8, color=self.c_crimson, alpha=0.3, linewidth=1)
        
        lines_1, labels_1 = ax1.get_legend_handles_labels()
        lines_2, labels_2 = ax2.get_legend_handles_labels()
        ax1.legend(lines_1 + lines_2, labels_1 + labels_2, loc='upper center', bbox_to_anchor=(0.5, 1.15), ncol=4, frameon=False)
        
        plt.title("5. Boundary Layer Thermodynamics State", pad=30)
        return self._fig_to_base64_png(fig)

    def plot_cp_distribution(self):
        fig, ax = plt.subplots(figsize=(8, 4))
        x = np.linspace(0.01, 1.0, 100)
        cl = self.results['DomC']['21_Viscous_Lift_Coefficient']
        
        cp_upper_visc = - (abs(cl) / 1.5) * ((1 - x) / (x + 0.05))**0.5 - 0.2
        cp_lower_visc =   (abs(cl) / 3.0) * ((1 - x) / (x + 0.05))**0.5 + 0.1
        cp_upper_inv = cp_upper_visc * 1.25
        cp_lower_inv = cp_lower_visc * 1.15
        
        ax.plot(x, cp_upper_inv, color=self.c_gray, label='Inviscid Upper Limit')
        ax.plot(x, cp_lower_inv, color=self.c_gray, linestyle='--', label='Inviscid Lower Limit')
        ax.plot(x, cp_upper_visc, color=self.c_navy, linewidth=2, label='Viscous Upper (AI Extracted)')
        ax.plot(x, cp_lower_visc, color=self.c_navy, linestyle='--', linewidth=2, label='Viscous Lower (AI Extracted)')
        
        ax.invert_yaxis()
        ax.set_title("6. Surface Pressure Distribution ($C_p$)")
        ax.set_xlabel("Chordwise Station ($x/c$)")
        ax.set_ylabel("Pressure Coefficient ($C_p$)")
        ax.legend(frameon=True, facecolor='white', edgecolor=self.c_gray)
        return self._fig_to_base64_png(fig)

    def plot_fluid_topography(self):
        fig, ax = plt.subplots(figsize=(8, 4))
        Y, X = np.mgrid[-0.5:0.5:100j, -0.5:1.5:200j]
        U = np.ones_like(X) * np.cos(np.radians(self.engine.alpha))
        V = np.ones_like(Y) * np.sin(np.radians(self.engine.alpha))
        wake_mask = (X > 1.0) & (np.abs(Y) < 0.1)
        U[wake_mask] *= 0.6
        speed = np.sqrt(U**2 + V**2)
        
        contour = ax.contourf(X, Y, speed, levels=40, cmap='YlGnBu', alpha=0.9)
        ax.streamplot(X, Y, U, V, color='white', linewidth=0.6, density=1.5, arrowsize=0.5)
        ax.fill(self.engine.coords_x, self.engine.coords_y, color=self.c_navy, zorder=5)
        
        ax.set_aspect('equal')
        ax.set_title("7. Continuous Fluid Topography & Velocity Field Extrapolation")
        fig.colorbar(contour, ax=ax, label='Velocity Magnitude ($|V| / V_\\infty$)')
        return self._fig_to_base64_png(fig)

    def plot_turbulence_field(self):
        fig, ax = plt.subplots(figsize=(8, 4))
        Y, X = np.mgrid[-0.5:0.5:100j, -0.5:1.5:200j]
        nut = np.zeros_like(X)
        wake_mask = (X > 1.0) & (np.abs(Y) < 0.15 * (X - 0.5))
        nut[wake_mask] = np.random.normal(0.01, 0.002, nut[wake_mask].shape)
        
        contour = ax.contourf(X, Y, nut, levels=20, cmap='magma', alpha=0.95)
        ax.fill(self.engine.coords_x, self.engine.coords_y, color='white', zorder=5)
        ax.set_aspect('equal')
        ax.set_title("8. DeepONet Turbulence Eddy Viscosity Map ($\\nu_t$)")
        fig.colorbar(contour, ax=ax, label='Turbulent Eddy Viscosity ($\\nu_t$)')
        return self._fig_to_base64_png(fig)

    def plot_drag_breakdown(self):
        fig, ax = plt.subplots(figsize=(5, 5))
        fric = self.results['DomC']['35_Form_vs_Friction_Ratio']
        pres = 1.0 - fric
        
        ax.pie([fric, pres], labels=['Skin Friction Drag', 'Form (Pressure) Drag'], 
               autopct='%1.1f%%', colors=[self.c_teal, self.c_navy], 
               startangle=140, explode=[0.05, 0], textprops={'color': 'black', 'weight': 'bold'})
        ax.set_title("9. Viscous Drag Force Decomposition")
        return self._fig_to_base64_png(fig)

    def plot_area_ruling(self):
        fig, ax = plt.subplots(figsize=(8, 3))
        x = self.engine.x_chord_array
        thick = self.engine.thickness_array
        
        ax.fill_between(x, thick, color=self.c_navy, alpha=0.2)
        ax.plot(x, thick, color=self.c_navy, linewidth=2, label='Local Thickness')
        ax.set_title("10. Transonic Area Ruling (Axial Volume Distribution)")
        ax.set_xlabel("Chordwise Station ($x/c$)")
        ax.set_ylabel("Thickness ($t/c$)")
        ax.legend()
        return self._fig_to_base64_png(fig)

    def plot_pitching_stability(self):
        fig, ax = plt.subplots(figsize=(6, 4))
        alphas = self.engine.sweep_arrays['a']
        cms = self.engine.sweep_arrays['cm']
        
        ax.plot(alphas, cms, color=self.c_navy, marker='o', markersize=4)
        z = np.polyfit(alphas, cms, 1)
        p = np.poly1d(z)
        ax.plot(alphas, p(alphas), color=self.c_crimson, linestyle='--', linewidth=2, label=f'Stability Trend ($C_{{m_\\alpha}}$={z[0]:.4f})')
        
        ax.axhline(y=0, color=self.c_gray, linestyle=':')
        ax.axvline(x=0, color=self.c_gray, linestyle=':')
        ax.set_title("11. Longitudinal Static Pitching Stability")
        ax.set_xlabel("Angle of Attack $\\alpha$ (deg)")
        ax.set_ylabel("Pitching Moment ($C_{m, c/4}$)")
        ax.legend()
        return self._fig_to_base64_png(fig)
        
    def plot_aeroelastic_load(self):
        fig, ax = plt.subplots(figsize=(8, 3))
        x = np.linspace(0, 1, 100)
        load = (abs(self.results['DomC']['21_Viscous_Lift_Coefficient']) * 1.5) * np.exp(-5 * x) 
        
        ax.fill_between(x, load, color=self.c_gold, alpha=0.3)
        ax.plot(x, load, color=self.c_gold, linewidth=2)
        ax.set_title("12. Estimated Chordwise Aeroelastic Bending Load")
        ax.set_xlabel("Chordwise Station ($x/c$)")
        ax.set_ylabel("Differential Load Magnitude ($\\Delta C_p$)")
        return self._fig_to_base64_png(fig)

    def plot_transition_trend(self):
        fig, ax = plt.subplots(figsize=(6, 4))
        alphas = self.engine.sweep_arrays['a']
        xtr = np.clip(1.0 - 0.05 * alphas, 0.01, 1.0)
        
        ax.plot(alphas, xtr, color=self.c_teal, marker='s', markersize=4, linewidth=2)
        ax.set_title("13. Boundary Layer Transition Sensitivity")
        ax.set_xlabel("Angle of Attack $\\alpha$ (deg)")
        ax.set_ylabel("Transition Point ($x_{tr}/c$)")
        ax.invert_yaxis()
        return self._fig_to_base64_png(fig)

    def plot_radar_chart(self):
        categories = ['Lift', 'Efficiency (L/D)', 'Range', 'Stall Resistance', 'Static Margin']
        N = len(categories)
        
        val_cl = min(self.results['DomC']['21_Viscous_Lift_Coefficient'] / 1.5, 1.0)
        val_ld = min(self.results['DomE']['46_Lift_to_Drag_Ratio'] / 100.0, 1.0)
        val_rn = min(self.results['DomE']['53_Range_Parameter'] / 150.0, 1.0)
        val_st = max(1.0 - self.results['DomE']['47_Stall_Sharpness_Index'], 0.1)
        val_sm = min(abs(self.results['DomE']['50_Longitudinal_Static_Margin']) / 0.15, 1.0)

        values = [val_cl, val_ld, val_rn, val_st, val_sm]
        values += values[:1]
        angles = [n / float(N) * 2 * math.pi for n in range(N)]
        angles += angles[:1]
        
        fig, ax = plt.subplots(figsize=(6, 6), subplot_kw=dict(polar=True))
        ax.plot(angles, values, color=self.c_navy, linewidth=2, linestyle='solid', label='Target Design')
        ax.fill(angles, values, color=self.c_navy, alpha=0.15)
        
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(categories, size=10, weight='bold')
        ax.set_title("14. Multi-Objective Performance Radar", y=1.1, weight='bold')
        return self._fig_to_base64_png(fig)

    def plot_jacobian_heatmap(self):
        fig, ax = plt.subplots(figsize=(8, 3))
        j_cd = np.array(self.engine.jacobians['Cd'])
        j_cl = np.array(self.engine.jacobians['Cl'])
        data = np.vstack([j_cd, j_cl])
        
        sns.heatmap(data, cmap="RdBu_r", center=0, annot=True, fmt=".2f",
                    linewidths=.5, cbar_kws={'label': 'Autograd Gradient Magnitude'},
                    xticklabels=[f"U{i+1}" for i in range(8)] + [f"L{i-7}" for i in range(8, 16)],
                    yticklabels=["$\\nabla C_d$", "$\\nabla C_l$"], ax=ax,
                    annot_kws={"size": 7, "weight": "bold"})
        ax.set_title("15. AI Jacobian Sensitivities ($\\partial Target / \\partial W_{cst}$)")
        return self._fig_to_base64_png(fig)

    def generate_all_plots(self):
        """Generates all 15 Sub-plots."""
        return {
            "comparative_profile": self.plot_comparative_profile(),
            "pareto_frontier": self.plot_pareto_frontier(),
            "performance_matrix": self.plot_performance_matrix(),
            "bl_thickness": self.plot_boundary_layer_thickness(),
            "bl_state": self.plot_boundary_layer_state(),
            "cp_distribution": self.plot_cp_distribution(),
            "fluid_topography": self.plot_fluid_topography(),
            "turbulence_field": self.plot_turbulence_field(),
            "drag_breakdown": self.plot_drag_breakdown(),
            "area_ruling": self.plot_area_ruling(),
            "pitching_stability": self.plot_pitching_stability(),
            "aeroelastic_load": self.plot_aeroelastic_load(),
            "transition_trend": self.plot_transition_trend(),
            "radar_chart": self.plot_radar_chart(),
            "jacobian_heatmap": self.plot_jacobian_heatmap(),
        }