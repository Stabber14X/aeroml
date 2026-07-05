# backend/app/api/__init__.py
from . import auth
from . import airfoils
from . import predict
from . import optimize
from . import geometry
from . import mission
from . import analysis
from . import deep_analysis
from . import aerosage
from . import vision
from . import finite_wing
from . import admin
from . import payments

__all__ = [
    'auth',
    'airfoils',
    'predict',
    'optimize',
    'geometry',
    'mission',
    'analysis',
    'deep_analysis',
    'aerosage',
    'vision',
    'finite_wing',
    'admin',
    'payments'
]