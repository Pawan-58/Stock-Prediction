import sys
import os

# Add the Backend directory to Python's search path
# This allows 'from predict import ...' inside Backend/app.py to work
backend_path = os.path.join(os.path.dirname(__file__), 'Backend')
sys.path.insert(0, backend_path)

# Now import the FastAPI app from Backend/app.py
try:
    from app import app
except ImportError as e:
    print(f"Error importing app: {e}")
    print(f"Current directory: {os.getcwd()}")
    print(f"Directory contents: {os.listdir(os.getcwd())}")
    if os.path.exists('Backend'):
        print(f"Backend directory contents: {os.listdir('Backend')}")
    raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
