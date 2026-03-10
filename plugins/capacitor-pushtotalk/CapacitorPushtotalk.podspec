require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CapacitorPushtotalk'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = package['repository']['url']
  s.author = package['author']
  s.source = { :git => package['repository']['url'], :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '16.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
  
  # Core frameworks
  s.frameworks = 'AVFoundation', 'CoreBluetooth'

  # Flic 2 SDK: manually add flic2lib.xcframework to Xcode project
  # Download from: https://github.com/50ButtonsEach/flic2lib-ios
  # Then drag into Frameworks, Libraries, and Embedded Content (Embed & Sign)
end
