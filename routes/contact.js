import express from 'express';
import ContactMessage from '../models/contactmessage.js';

const router=express.Router();

router.post('/',async(req,res)=>{
    try{
        const {name,email,message}=req.body;
        if(!name||!email||!message){
            return res.status(400).json({message:'All fields are required'});
        }
        const contactMessage=new ContactMessage({name,email,message});
        await contactMessage.save();

        console.log('Contact message received:',{name, email,message});
        res.status(200).json({message:'Contact message received successfully'});
    }catch(error){
        res.status(500).json({message:error.message});
    }
});

export default router;