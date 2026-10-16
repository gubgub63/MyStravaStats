// Regenerate the native app icon: swift scripts/make-ios-icon.swift
import AppKit
let size=1024
let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
NSColor(red:0.055,green:0.12,blue:0.14,alpha:1).setFill();NSBezierPath(rect:NSRect(x:0,y:0,width:size,height:size)).fill()
let mountain=NSBezierPath();mountain.move(to:NSPoint(x:150,y:290));mountain.line(to:NSPoint(x:435,y:754));mountain.line(to:NSPoint(x:610,y:478));mountain.line(to:NSPoint(x:716,y:636));mountain.line(to:NSPoint(x:890,y:290));mountain.close()
NSColor(red:0.51,green:0.76,blue:0.68,alpha:1).setFill();mountain.fill()
let snow=NSBezierPath();snow.move(to:NSPoint(x:435,y:754));snow.line(to:NSPoint(x:345,y:608));snow.line(to:NSPoint(x:431,y:640));snow.line(to:NSPoint(x:488,y:602));snow.line(to:NSPoint(x:521,y:618));snow.close();NSColor(red:0.91,green:0.96,blue:0.93,alpha:1).setFill();snow.fill()
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"apps/ios/MyStats/Assets.xcassets/AppIcon.appiconset/AppIcon.png"))
