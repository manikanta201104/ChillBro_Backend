// import express from 'express';
// import { logger } from '../index.js';
// import User from '../models/user.js';


// const router=express.Router();

// router.post('/',async(req,res)=>{
//     const{username,email,password}=req.body;
//     try{
//         const user=new User({
//             userId:`user_${Date.now()}`,
//             username,
//             email,
//             password,
//             spotifyToken:null,
//             preferences:{},
//         });
//         await user.save();
//         res.status(201).json(user);
//     }catch(error){
//         logger.error('Error creating test user:',error);
//         throw error;
//     }
// });

// export default router;
