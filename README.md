# 🍌 BananaVision

BananaVision is an AI-powered mobile application for detecting banana fingers
and classifying banana ripeness using deep learning.

The application combines a React Native mobile application with a FastAPI
backend and YOLOv8 computer vision models.

## Features

- Detect banana fingers from images
- Classify banana ripeness
- User registration and authentication
- Store scan history
- View scan results and details
- Submit user feedback

## Tech Stack

### Mobile
- React Native
- Expo
- JavaScript

### Backend
- Python
- FastAPI
- REST API

### AI / Computer Vision
- YOLOv8
- Object Detection
- Image Classification

### Database / Authentication
- Supabase

## System Architecture

React Native App
        ↓
     FastAPI
        ↓
     YOLOv8
        ↓
     Results
        ↓
    Supabase

## Screenshots

Add screenshots of the application here.

Example:

![Home Screen](screenshots/home.png)

![Detection Result](screenshots/result.png)

![Scan History](screenshots/history.png)

## How It Works

1. The user opens the BananaVision mobile application.
2. The application captures or receives an image of bananas.
3. The image is sent to the FastAPI backend.
4. YOLOv8 analyzes the image.
5. The prediction result is returned to the mobile application.
6. Scan information can be stored in Supabase.

## Project Purpose

This project was developed as an academic capstone project in
Information Technology at the University of the Thai Chamber of Commerce (UTCC).

The project explores the integration of mobile application development,
backend APIs, databases, and computer vision.

## Developer

Weeratat Kwandee  
Information Technology Student  
University of the Thai Chamber of Commerce (UTCC)
