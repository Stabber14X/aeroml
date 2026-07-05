from app.celery_app import celery_app
from app.ml_engine.loader import ai_brain
import numpy as np
import time
import torch
import traceback

@celery_app.task(name="genetic_optimization_task", bind=True)
def run_genetic_optimization(self, initial_cst: list, reynolds: float, alpha: float, generations: int = 50):
    """
    Defensive GA optimization, with a top level exception handler that returns
    structured failure information and prints full tracebacks so nothing leaks
    as an uncaught ValueError to Celery internals.
    """
    task_id = getattr(self.request, "id", "<no-id>")

    try:
        print(f"Task {task_id}: Starting optimization for {generations} generations.")

        # Load artifacts
        try:
            ai_brain.load_artifacts()
        except Exception as e:
            tb = traceback.format_exc()
            print(f"Task {task_id}: load_artifacts exception: {e}\n{tb}")
            return {"status": "FAILED", "detail": f"load_artifacts exception: {e}"}

        # FIX: Point to the new scalar_model attribute
        model = getattr(ai_brain, "scalar_model", None)
        scaler_x = getattr(ai_brain, "scaler_x", None)
        scaler_y = getattr(ai_brain, "scaler_y", None)

        if model is None:
            detail = "AI model is None after load_artifacts."
            print(f"Task {task_id}: {detail}")
            return {"status": "FAILED", "detail": detail}
        if scaler_x is None:
            detail = "scaler_x is missing on ai_brain."
            print(f"Task {task_id}: {detail}")
            return {"status": "FAILED", "detail": detail}
        if scaler_y is None:
            detail = "scaler_y is missing on ai_brain."
            print(f"Task {task_id}: {detail}")
            return {"status": "FAILED", "detail": detail}

        expected_in_features = getattr(scaler_x, "n_features_in_", None)
        initial_cst_np = np.array(initial_cst, dtype=float)
        if initial_cst_np.size == 0:
            detail = "initial_cst is empty."
            print(f"Task {task_id}: {detail}")
            return {"status": "FAILED", "detail": detail}

        # Self-test with one inference, verbose diagnostics
        try:
            test_input_list = initial_cst_np.tolist() + [reynolds, alpha]
            test_input = np.array([test_input_list], dtype=float)
            print(f"Task {task_id}: Self-test raw input shape {test_input.shape}")

            if expected_in_features is not None and test_input.shape[1] != expected_in_features:
                detail = f"Feature count mismatch in self-test, expected {expected_in_features}, got {test_input.shape[1]}"
                print(f"Task {task_id}: {detail}")
                return {"status": "FAILED", "detail": detail}

            test_scaled = scaler_x.transform(test_input)
            print(f"Task {task_id}: Self-test scaled input shape {test_scaled.shape}")

            if np.isnan(test_scaled).any() or np.isinf(test_scaled).any():
                detail = "NaN or Inf found in scaled test input."
                print(f"Task {task_id}: {detail}, scaled values: {test_scaled}")
                return {"status": "FAILED", "detail": detail}

            with torch.no_grad():
                tensor_in = torch.tensor(test_scaled, dtype=torch.float32)
                tensor_out = model(tensor_in)

            if tensor_out is None:
                detail = "model returned None in self-test."
                print(f"Task {task_id}: {detail}")
                return {"status": "FAILED", "detail": detail}

            out_np = tensor_out.numpy() if hasattr(tensor_out, "numpy") else np.asarray(tensor_out)
            print(f"Task {task_id}: Self-test model raw output shape: {out_np.shape}, dtype: {out_np.dtype}")

            if out_np.ndim == 1:
                out_for_scaler = out_np.reshape(1, -1)
            elif out_np.ndim == 2:
                out_for_scaler = out_np
            else:
                detail = f"Unexpected model output ndim in self-test: {out_np.ndim}"
                print(f"Task {task_id}: {detail}")
                return {"status": "FAILED", "detail": detail}

            if out_for_scaler.size == 0:
                detail = "Model output array is empty in self-test."
                print(f"Task {task_id}: {detail}")
                return {"status": "FAILED", "detail": detail}

            try:
                output_real = scaler_y.inverse_transform(out_for_scaler)
            except Exception as inv_ex:
                tb = traceback.format_exc()
                detail = f"scaler_y.inverse_transform failed: {inv_ex}"
                print(f"Task {task_id}: {detail}\n{tb}")
                return {"status": "FAILED", "detail": detail}

            print(f"Task {task_id}: Self-test inverse-transformed output shape: {output_real.shape}, values: {output_real}")

            if output_real.ndim != 2 or output_real.shape[1] < 3:
                detail = f"Self-test output insufficient columns, expected >=3, got {output_real.shape}"
                print(f"Task {task_id}: {detail}")
                return {"status": "FAILED", "detail": detail}

        except Exception as e:
            tb = traceback.format_exc()
            detail = f"Exception during self-test: {e}"
            print(f"Task {task_id}: {detail}\n{tb}")
            return {"status": "FAILED", "detail": detail}

        # GA core
        coef_len = initial_cst_np.size
        current_cst_np = initial_cst_np.copy()
        best_lift_drag = 0.001

        for gen in range(1, generations + 1):
            mutation_strength = 0.005
            mutated_cst_np = current_cst_np + (np.random.rand(coef_len) - 0.5) * mutation_strength
            current_ld = 0.0

            try:
                input_list = mutated_cst_np.tolist() + [reynolds, alpha]
                input_array = np.array([input_list], dtype=float)

                if expected_in_features is not None and input_array.shape[1] != expected_in_features:
                    msg = f"Gen {gen}: feature count mismatch, expected {expected_in_features}, got {input_array.shape[1]}"
                    print(f"Task {task_id}: {msg}")
                    current_ld = 0.0
                    raise ValueError(msg)

                input_scaled = scaler_x.transform(input_array)
                if np.isnan(input_scaled).any() or np.isinf(input_scaled).any():
                    msg = f"Gen {gen}: scaled input contained NaN or Inf"
                    print(f"Task {task_id}: {msg}, scaled: {input_scaled}")
                    current_ld = 0.0
                    raise ValueError(msg)

                with torch.no_grad():
                    tensor_in = torch.tensor(input_scaled, dtype=torch.float32)
                    tensor_out = model(tensor_in)

                if tensor_out is None:
                    msg = f"Gen {gen}: model returned None"
                    print(f"Task {task_id}: {msg}")
                    current_ld = 0.0
                    raise ValueError(msg)

                out_np = tensor_out.numpy() if hasattr(tensor_out, "numpy") else np.asarray(tensor_out)
                if out_np.ndim == 1:
                    out_for_scaler = out_np.reshape(1, -1)
                elif out_np.ndim == 2:
                    out_for_scaler = out_np
                else:
                    msg = f"Gen {gen}: unexpected output ndim {out_np.ndim}"
                    print(f"Task {task_id}: {msg}")
                    current_ld = 0.0
                    raise ValueError(msg)

                if out_for_scaler.size == 0:
                    msg = f"Gen {gen}: model output array empty"
                    print(f"Task {task_id}: {msg}")
                    current_ld = 0.0
                    raise ValueError(msg)

                try:
                    output_real = scaler_y.inverse_transform(out_for_scaler)
                except Exception as inv_ex:
                    tb = traceback.format_exc()
                    msg = f"Gen {gen}: scaler_y.inverse_transform failed: {inv_ex}"
                    print(f"Task {task_id}: {msg}\n{tb}")
                    current_ld = 0.0
                    raise ValueError(msg)

                if output_real.ndim != 2 or output_real.shape[1] < 3 or output_real.shape[0] < 1:
                    msg = f"Gen {gen}: inverse-transformed output has invalid shape {output_real.shape}"
                    print(f"Task {task_id}: {msg}, output_real: {output_real}")
                    current_ld = 0.0
                    raise ValueError(msg)

                first_row = output_real[0]
                cl = float(first_row[0]) if len(first_row) > 0 else 0.0
                cd = float(first_row[1]) if len(first_row) > 1 else 0.0
                cm = float(first_row[2]) if len(first_row) > 2 else 0.0

                if not np.isfinite(cl) or not np.isfinite(cd) or not np.isfinite(cm):
                    msg = f"Gen {gen}: non finite outputs cl, cd, cm -> {cl}, {cd}, {cm}"
                    print(f"Task {task_id}: {msg}")
                    current_ld = 0.0
                else:
                    eps = 1e-8
                    if abs(cd) < 1e-6:
                        print(f"Task {task_id}: Gen {gen}: cd too small {cd}, skipping fitness calculation")
                        current_ld = 0.0
                    else:
                        current_ld = cl / (cd + eps)

            except Exception:
                current_ld = 0.0

            if current_ld > best_lift_drag:
                current_cst_np = mutated_cst_np
                best_lift_drag = current_ld
                print(f"Task {task_id}: Gen {gen}: New best L/D {best_lift_drag}")

            # update state
            try:
                self.update_state(
                    state='PROGRESS',
                    meta={
                        'current': gen,
                        'total': generations,
                        'message': f"Generation {gen}/{generations} complete, best L/D: {round(best_lift_drag, 6)}",
                        'best_ld': round(best_lift_drag, 6)
                    }
                )
            except Exception as e:
                print(f"Task {task_id}: update_state exception: {e}")

            time.sleep(0.1)

        result = {
            "status": "COMPLETED",
            "best_lift_drag": float(round(best_lift_drag, 6)),
            "optimized_cst": current_cst_np.tolist(),
            "generations_run": generations
        }
        print(f"Task {task_id}: Completed optimization, result: {result}")
        return result

    except Exception as top_e:
        tb = traceback.format_exc()
        print(f"Task {task_id}: Unhandled exception in task, returning structured failure. Exception: {top_e}\n{tb}")
        return {"status": "FAILED", "detail": f"Unhandled exception: {top_e}", "traceback": tb}