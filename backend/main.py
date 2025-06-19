from fastapi import FastAPI

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    print("Torb Records API alive")

@app.get("/")
async def read_root():
    return {"message": "Torb Records API is running"}
