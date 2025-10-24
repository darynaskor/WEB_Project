/*import React, {useState} from 'react';
import './App.css';
import Slider from './Slider.jsx'
import SidebarItem from './SidebarItem.jsx';


const DEFAULT_OPTIONS=[
  {
    name:'BRIGHTNESS',
    property:'brightness',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'CONTRAST',
    property:'contrast',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'SATURATION',
    property:'saturate',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'GRAYSCALE',
    property:'grayscale',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
    {
    name:'SEPIA',
    property:'sepia',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
      {
    name:'HUE',
    property:'hue-rotate',
    value:0,
    range:{
      min:0,
      max:360
    },
    unit: 'deg'
  },
      {
    name:'BLUR',
    property:'blur',
    value:0,
    range:{
      min:0,
      max:20
    },
    unit: 'px'
  }
]

function App(){
  const[selectedOptionIndex, setselectedOptionIndex]=useState(0)
  const[options, setOptions]=useState(DEFAULT_OPTIONS)
  const [imageURL, setImageURL] = useState(null);

  const selectedOption=options[selectedOptionIndex]

  function handleSliderChange({target}){
    setOptions(prevOptions=>{
      return prevOptions.map((option,index)=>{
        if(index !==selectedOptionIndex) return option
        return{...option,value:target.value}
      })
    })
}

function getImageStyle(){
  const filters=options.map(option=>{
    return`${option.property}(${option.value}${option.unit})`
  })
  return {filter:filters.join(' ')}
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (file) {
    const imageURL = URL.createObjectURL(file);
    setImageURL(imageURL);
  }
}

return (
    <> 
      <nav className="toolbar">
        <a href="#">PROFILE</a>
        <a href="#">HISTORY</a>
        <a href="#">LOGOUT</a>
      </nav>
      <div className="container">
        <div className="main-image" style={getImageStyle()}></div>
        <div className="sidebar">
          {options.map((option,index)=>{
            return (
            <SidebarItem
            key={index}
            name={option.name}
            active={index === selectedOptionIndex}
            handleClick={()=>setselectedOptionIndex(index)}
            />
          )
          })}
        </div>
        <Slider 
        min={selectedOption.range.min}
        max={selectedOption.range.max}
        value={selectedOption.value}
        handleChange={handleSliderChange}
        />
      </div>
    </>
  )
}

export default App;*/
import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import Slider from './Slider.jsx'
import SidebarItem from './SidebarItem.jsx';



const DEFAULT_OPTIONS=[
  {
    name:'BRIGHTNESS',
    property:'brightness',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'CONTRAST',
    property:'contrast',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'SATURATION',
    property:'saturate',
    value:100,
    range:{
      min:0,
      max:200
    },
    unit: '%'
  },
    {
    name:'GRAYSCALE',
    property:'grayscale',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
    {
    name:'SEPIA',
    property:'sepia',
    value:0,
    range:{
      min:0,
      max:100
    },
    unit: '%'
  },
      {
    name:'HUE',
    property:'hue-rotate',
    value:0,
    range:{
      min:0,
      max:360
    },
    unit: 'deg'
  },
      {
    name:'BLUR',
    property:'blur',
    value:0,
    range:{
      min:0,
      max:20
    },
    unit: 'px'
  }
]

function deepCopyOptions(options){
  return options.map(o => ({ ...o, range: { ...o.range } }));
}

function App(){
  const[selectedOptionIndex, setselectedOptionIndex]=useState(0)
  const[options, setOptions]=useState(deepCopyOptions(DEFAULT_OPTIONS))
  const [imageURL, setImageURL] = useState(null);
  const fileInputRef = useRef(null); // ADDED: ref to hidden file input
  const initialOptionsRef = useRef(deepCopyOptions(DEFAULT_OPTIONS)); // ADDED: store initial for RESET
  const [history, setHistory] = useState([]); // ADDED: history stack for BACK

  const selectedOption=options[selectedOptionIndex]

  function handleSliderChange({target}){
    const newVal = Number(target.value); // ADDED: ensure numeric
    const currentVal = options[selectedOptionIndex].value;
    if (newVal === currentVal) return; // nothing changed -> don't push to history

    // ADDED: push current state copy to history before changing
    setHistory(prev => {
      const copy = deepCopyOptions(options);
      const max = 50;
      const next = [...prev, copy];
      if (next.length > max) next.shift();
      return next;
    });

    setOptions(prevOptions=>{
      return prevOptions.map((option,index)=>{
        if(index !==selectedOptionIndex) return option
        return{...option,value:newVal}
      })
    })
}

function getImageStyle(){
  const filters=options.map(option=>{
    return`${option.property}(${option.value}${option.unit})`
  })
  return {filter:filters.join(' ')}
}

// ADDED: handle upload (revoke previous URL to avoid leaks)
function handleImageUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const maxSizeMB = 5;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    alert(`Файл занадто великий! Максимальний розмір — ${maxSizeMB} MB.`);
    e.target.value = '';
    return;
  }

  const img = new Image();
  const reader = new FileReader();

  reader.onload = (event) => {
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');

      const targetWidth = 600;   
      const targetHeight = 800;  
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');

      // Визначаємо квадрат для центрування та обрізки
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const dx = (targetWidth - scaledWidth) / 2;
      const dy = (targetHeight - scaledHeight) / 2;

      ctx.drawImage(img, dx, dy, scaledWidth, scaledHeight);

      const croppedURL = canvas.toDataURL('image/jpeg');
      if (imageURL) URL.revokeObjectURL(imageURL);
      setImageURL(croppedURL);
    };
  };

  reader.readAsDataURL(file);
};



// ADDED: open hidden file input
function openFilePicker(){
  fileInputRef.current?.click();
}

// ADDED: clear image
function clearImage(){
  if(imageURL){
    URL.revokeObjectURL(imageURL);
    setImageURL(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }
}

// ADDED: Back (undo one step)
function handleBack(){
  setHistory(prev => {
    if(prev.length === 0) return prev;
    const last = prev[prev.length - 5];
    setOptions(deepCopyOptions(last));
    return prev.slice(0, prev.length - 5);
  });
}

// ADDED: Reset to initial options
function handleReset(){
  setOptions(deepCopyOptions(initialOptionsRef.current));
  setHistory([]);
  setselectedOptionIndex(0);
}

// ADDED: cleanup objectURL on unmount
useEffect(() => {
  return () => {
    if (imageURL) URL.revokeObjectURL(imageURL);
  };
}, [imageURL]);

return (
    <> 
      <nav className="toolbar">
        <a href="#">PROFILE</a>
        <a href="#">HISTORY</a>
        <a href="#">LOGOUT</a>
      </nav>

      {/* ADDED: hidden input + visible upload/clear/back/reset buttons */}
      <div className="top-controls">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
        <button className="btn" onClick={openFilePicker}>UPLOAD</button>
        <button className="btn" onClick={clearImage} disabled={!imageURL}>DELETE</button>
        <button className="btn" onClick={handleBack} disabled={history.length === 1}>BACK</button>
        <button className="btn" onClick={handleReset}>RESET</button>
      </div>

      <div className="container">
        <div className="main-image" style={getImageStyle()}>
          {/* ADDED: show uploaded image if present */}
          {imageURL ? (
            <img src={imageURL} alt="Uploaded" className="image-preview" />
          ) : null}
        </div>

        <div className="sidebar">
          {options.map((option,index)=>{
            return (
            <SidebarItem
            key={index}
            name={option.name}
            active={index === selectedOptionIndex}
            handleClick={()=>setselectedOptionIndex(index)}
            />
          )
          })}
        </div>

        <Slider 
        min={selectedOption.range.min}
        max={selectedOption.range.max}
        value={selectedOption.value}
        handleChange={handleSliderChange}
        />
      </div>
    </>
  )
}

export default App;
