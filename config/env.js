import dotenv from "dotenv";
dotenv.config();

const requiredEnvVars=['MONGO_URI','PORT','JWT_SECRET'];

requiredEnvVars.forEach(varName=>{
    if(!process.env[varName]){
        throw new Error(`Environment variable ${varName} is missing`);
    }
})

export const config={
    port:process.env.PORT,
    mongoUri:process.env.MONGO_URI,
    jwtSecret:process.env.JWT_SECRET,
};
