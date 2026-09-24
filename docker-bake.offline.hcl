target "seedemu_emulator_service" {
  output = [
    "type=oci,dest=./multiarch/seedemu-emulator-service.tar"
  ]
}

target "seedemu_internet_map_toplogy" {
  output = [
    "type=oci,dest=./multiarch/seedemu-internet-toplogy.tar"
  ]
}

target "seedemu_internet_map_geographic" {
  output = [
    "type=oci,dest=./multiarch/seedemu-internet-map-geographic.tar"
  ]
}

target "seedemu_internet_map_satellite" {
  output = [
    "type=oci,dest=./multiarch/seedemu-internet-map-satellite.tar"
  ]
}

target "seedemu_satellite_emulator_service" {
  output = [
    "type=oci,dest=./multiarch/seedemu-satellite-emulator-service.tar"
  ]
}

target "seedemu_traffic_observer_service" {
  output = [
    "type=oci,dest=./multiarch/seedemu-traffic-observer-service.tar"
  ]
}