import React from 'react';
import SidebarItem from '../SidebarItem.jsx';
import Slider from '../Slider.jsx';

function ImageWorkspace({
  imageURL,
  imageStyle,
  options,
  selectedOptionIndex,
  onSelectOption,
  slider,
}) {
  return (
    <div className="container">
      <div className="main-image" style={imageStyle}>
        {imageURL ? <img src={imageURL} alt="Uploaded" className="image-preview" /> : null}
      </div>

      <div className="sidebar">
        {options.map((option, index) => (
          <SidebarItem
            key={option.name}
            name={option.name}
            active={index === selectedOptionIndex}
            handleClick={() => onSelectOption(index)}
          />
        ))}
      </div>

      <Slider
        min={slider.min}
        max={slider.max}
        value={slider.value}
        handleChange={slider.onChange}
      />
    </div>
  );
}

export default ImageWorkspace;
