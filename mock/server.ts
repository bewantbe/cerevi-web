import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";

const mockArray: MockMethod[] = [
  {
    url: "/health",
    method: "get",
    response: () => {
      return Mock.mock({
        status: "healthy",
        version: "0.0.0",
        data_path_exists: true,
      });
    },
  },
  {
    url: "/api/specimens",
    method: "get",
    timeout: 1000,
    response: () => {
      return Mock.mock([{
        id: "macaque_brain_RM009",
        name: "Macaque Brain RM009",
        species: "Macaca mulatta",
        description:
          "High-resolution macaque brain imaging with VISoR technology",
        has_image: true,
        has_atlas: true,
        has_model: true,
        channels: {
          "0": "405nm",
          "1": "488nm",
          "2": "561nm",
          "3": "640nm",
        },
        resolution_um: 10.0,
        coordinate_system: "right_handed",
        axes_order: "zyx",
      }]);
    },
  },
];

export default mockArray;
