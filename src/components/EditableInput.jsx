import React, { useState, useEffect, useRef } from 'react'

/**
 * EditableInput - Estado local para evitar parpadeos al escribir.
 * Solo actualiza el estado global (onSave) en onBlur o al pulsar Enter.
 */
const EditableInput = ({
  value = '',
  onSave,
  type = 'text',
  parseValue = (v) => v,
  formatForDisplay = (v) => (v === null || v === undefined || v === '' ? '' : String(v)),
  className = '',
  style = {},
  min,
  max,
  step,
  placeholder = '',
  tabIndex,
  onFocus,
  onBlur: onBlurProp,
  onWheel,
  ...rest
}) => {
  const [localValue, setLocalValue] = useState(() => formatForDisplay(value))
  const isFocusedRef = useRef(false)

  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(formatForDisplay(value))
    }
  }, [value, formatForDisplay])

  const handleBlur = (e) => {
    isFocusedRef.current = false
    const parsed = parseValue(localValue)
    onSave(parsed)
    onBlurProp?.(e)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.target.blur()
    }
  }

  const handleFocus = (e) => {
    isFocusedRef.current = true
    e.target.select?.()
    onFocus?.(e)
  }

  return (
    <input
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onWheel={onWheel}
      className={className}
      style={style}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      tabIndex={tabIndex}
      {...rest}
    />
  )
}

export default EditableInput
